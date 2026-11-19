import { create } from 'zustand';
import { api } from 'src/utils/api';
import { useRoomStore } from 'src/store/room';
import type { Collection, Track } from 'src/models/spotify';

/**
 * Spotify connection for importing playlists. The browser signs in with Spotify (authorization code + PKCE, so no
 * secret is involved), reads the user's own playlists, and sends only song titles and artists to our API, which
 * matches them to recordings we can play. Tokens stay in this browser.
 */
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const SCOPES = 'playlist-read-private playlist-read-collaborative user-library-read playlist-modify-private';
const STORE = 'spotifyAuth';
const VERIFIER = 'spotifyVerifier';

/** Spotify only redirects to http(s), so the desktop app's file:// pages cannot connect. */
export const spotifyAvailable = !!CLIENT_ID && /^https?:$/.test(window.location.protocol);

interface Stored {
  access: string;
  refresh?: string;
  expires: number;
  /** Permissions the user granted. Missing on connections made before Liked Songs and export were added. */
  scope?: string;
}

const redirectUri = () => `${window.location.origin}/spotify/callback`;

function load(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null');
  } catch {
    return null;
  }
}

function save(token: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }, previous?: Stored | null) {
  const stored: Stored = {
    access: token.access_token,
    refresh: token.refresh_token ?? previous?.refresh,
    expires: Date.now() + token.expires_in * 1000 - 30_000,
    scope: token.scope ?? previous?.scope,
  };
  try {
    localStorage.setItem(STORE, JSON.stringify(stored));
  } catch {
    /* storage blocked: the connection lasts until the page closes */
  }
  return stored;
}

export const isSpotifyConnected = () => !!load();

/** Whether the connection was granted a permission. Connections from before it was asked for need to reconnect. */
export const spotifyHasScope = (scope: string) => !!load()?.scope?.split(' ').includes(scope);

/** The connection lacks a permission a newer feature needs, so the user has to agree to it by connecting again. */
export class SpotifyNeedsReconnect extends Error {
  constructor() {
    super('spotify-needs-reconnect');
  }
}

export function disconnectSpotify() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* nothing stored */
  }
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const RETURN_TO = 'spotify-return-to';

/** Where to land once Spotify sends the browser back (the phone remote, say), instead of the import page. */
export const takeSpotifyReturn = () => {
  const path = sessionStorage.getItem(RETURN_TO);
  sessionStorage.removeItem(RETURN_TO);
  return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
};

export async function connectSpotify(returnTo?: string) {
  if (!spotifyAvailable) return;
  if (returnTo) sessionStorage.setItem(RETURN_TO, returnTo);
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(VERIFIER, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...body }),
  });
  if (!response.ok) throw new Error('Spotify sign-in failed');
  return response.json();
}

/** Finish the redirect back from Spotify. Returns whether the connection was made. */
export async function completeSpotifyLogin(search: string): Promise<boolean> {
  const code = new URLSearchParams(search).get('code');
  const verifier = sessionStorage.getItem(VERIFIER);
  sessionStorage.removeItem(VERIFIER);
  if (!code || !verifier) return false;
  try {
    save(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier }));
    return true;
  } catch {
    return false;
  }
}

async function accessToken(): Promise<string> {
  let stored = load();
  if (!stored) throw new Error('Not connected to Spotify');
  if (Date.now() >= stored.expires) {
    if (!stored.refresh) {
      disconnectSpotify();
      throw new Error('Not connected to Spotify');
    }
    try {
      stored = save(await tokenRequest({ grant_type: 'refresh_token', refresh_token: stored.refresh }), stored);
    } catch {
      disconnectSpotify();
      throw new Error('Not connected to Spotify');
    }
  }
  return stored.access;
}

export class SpotifyForbidden extends Error {
  constructor() {
    super('spotify-forbidden');
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function spotifyGet(url: string, body?: unknown, attempt = 0): Promise<any> {
  const response = await fetch(url.startsWith('http') ? url : `https://api.spotify.com/v1${url}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 429 && attempt < 4) {
    // Too many requests: wait as long as Spotify asks (the header is not always readable, so back off by default).
    const asked = Number(response.headers.get('Retry-After'));
    await sleep(Math.min(Math.max(asked > 0 ? asked : 2 ** attempt, 1), 15) * 1000);
    return spotifyGet(url, body, attempt + 1);
  }
  if (response.status === 401) {
    disconnectSpotify();
    throw new Error('Not connected to Spotify');
  }
  if (response.status === 403) throw new SpotifyForbidden();
  if (!response.ok) throw new Error(`Spotify returned ${response.status}`);
  return response.json();
}

export interface SpotifyProfile {
  id: string;
  name: string;
  image?: string;
}

export async function spotifyProfile(): Promise<SpotifyProfile> {
  const me: any = await spotifyGet('/me');
  return { id: me.id, name: me.display_name || me.id, image: me.images?.[0]?.url };
}

/**
 * The user's playlists as collections. Spotify only returns the songs of playlists the user owns or shares,
 * so the rest (ones they merely follow) are counted but left out: opening them would only fail.
 */
export async function spotifyPlaylists(): Promise<{ playlists: Collection[]; hidden: number }> {
  const me = await spotifyProfile();
  const playlists: Collection[] = [];
  let hidden = 0;
  let next: string | null = '/me/playlists?limit=50';
  while (next && playlists.length + hidden < 500) {
    const page: any = await spotifyGet(next);
    for (const p of page.items ?? []) {
      if (!p) continue;
      if (p.owner?.id !== me.id && !p.collaborative) {
        hidden += 1;
        continue;
      }
      playlists.push({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        type: 'playlist',
        images: p.images ?? [],
        owner: { displayName: p.owner?.display_name ?? '' },
        tracks: { total: p.items?.total ?? p.tracks?.total ?? 0 },
      } as unknown as Collection);
    }
    next = page.next;
  }
  return { playlists, hidden };
}

/** How far the playlist being matched has got, for the progress shown while it loads. */
export const useImportProgress = create<{ done: number; total: number }>(() => ({ done: 0, total: 0 }));

const BATCH = 20;
/** The most songs one import reads. Matching is remembered by the server, so only a first import of a long list is slow. */
const MAX_PLAYLIST = 1000;
const MAX_LIKED = 2000;
/** Batches asked of the server at once: the server matches each song with its own search, so they overlap well. */
const PARALLEL_BATCHES = 3;

/** The room this device is in, so the server lets a guest in a host's room import too. */
const activeRoom = () => useRoomStore.getState().joinedRoom || useRoomStore.getState().roomId || undefined;

/** The id the Liked Songs library goes by in place of a playlist id. */
export const LIKED = 'liked';

/** A playlist's songs matched to playable recordings, a batch at a time. Songs we cannot match are left out. */
export async function importSpotifyPlaylist(id: string): Promise<{ collection: Collection; tracks: Track[] }> {
  useImportProgress.setState({ done: 0, total: 0 });
  const liked = id === LIKED;
  if (liked && !spotifyHasScope('user-library-read')) throw new SpotifyNeedsReconnect();
  const meta = liked
    ? { name: 'Liked Songs', description: '', images: [], owner: { display_name: (await spotifyProfile()).name } }
    : await spotifyGet(`/playlists/${encodeURIComponent(id)}?fields=name,images,description,owner(display_name)`);
  // what Spotify knows besides the name: the server uses it to tell recordings that share a title apart
  const entries: { id?: string; title: string; artist: string; album?: string; cover?: string; duration_ms?: number }[] = [];
  let next: string | null = liked ? '/me/tracks?limit=50' : `/playlists/${encodeURIComponent(id)}/items?limit=100`;
  const limit = liked ? MAX_LIKED : MAX_PLAYLIST;
  let inSpotify = 0; // how many songs Spotify says the playlist has
  while (next && entries.length < limit) {
    const page: any = await spotifyGet(next);
    inSpotify = Math.max(inSpotify, page.total ?? 0);
    for (const row of page.items ?? []) {
      const song = row?.item ?? row?.track; // `track` is the pre-2026 field name
      if (!song || song.type === 'episode' || !song.name) continue;
      entries.push({
        id: song.id || undefined,
        title: song.name,
        artist: (song.artists ?? []).map((a: { name: string }) => a.name).join(', '),
        album: song.album?.name || undefined,
        cover: song.album?.images?.[0]?.url || undefined,
        duration_ms: song.duration_ms || undefined,
      });
    }
    next = page.next;
  }
  useImportProgress.setState({ done: 0, total: entries.length });
  // The server keeps the song-to-recording mapping, so asking again is quick; a few batches go at once.
  const found: { collection: Collection | null; tracks: Track[][] } = { collection: null, tracks: [] };
  const batches: { entries: typeof entries; index: number }[] = [];
  for (let i = 0; i < entries.length; i += BATCH) batches.push({ entries: entries.slice(i, i + BATCH), index: i / BATCH });
  let nextBatch = 0;
  let done = 0;
  const worker = async () => {
    while (nextBatch < batches.length) {
      const batch = batches[nextBatch++];
      const { data } = await api.post(
        '/import/resolve',
        { name: meta.name ?? 'Spotify', owner: meta.owner?.display_name || 'Spotify', entries: batch.entries, room_id: activeRoom() },
        { timeout: 90_000 }
      );
      found.collection ??= data.collection;
      found.tracks[batch.index] = data.tracks as Track[];
      done += batch.entries.length;
      useImportProgress.setState({ done });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker));
  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const track of found.tracks.flat()) { // in playlist order: the batches were read in order, whenever they finished
    if (!seen.has(track.id)) {
      seen.add(track.id);
      tracks.push(track);
    }
  }
  const cover = meta.images?.[0]?.url;
  return {
    collection: {
      ...(found.collection ?? ({} as Collection)),
      id,
      name: meta.name ?? 'Spotify',
      description: meta.description ?? '',
      owner: { displayName: meta.owner?.display_name ?? 'Spotify' },
      images: cover ? [{ url: cover }] : (found.collection?.images ?? []),
      tracks: { total: tracks.length },
      importStats: { matched: tracks.length, requested: entries.length, total: Math.max(inSpotify, entries.length) },
    } as Collection,
    tracks,
  };
}

export interface ExportResult {
  url: string;
  added: number;
  requested: number;
}

const normalize = (text: string) => text.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/["']/g, '').trim();

async function findSpotifyUri(title: string, artist: string): Promise<string | null> {
  const queries = [`track:${normalize(title)} artist:${normalize(artist)}`, `${normalize(title)} ${normalize(artist)}`];
  for (const q of queries) {
    try {
      const result: any = await spotifyGet(`/search?type=track&limit=1&q=${encodeURIComponent(q)}`);
      const uri = result.tracks?.items?.[0]?.uri;
      if (uri) return uri;
    } catch (error) {
      if (!(error instanceof SpotifyForbidden)) throw error;
    }
  }
  return null;
}

/** Save songs as a new private Spotify playlist. Songs Spotify cannot find are left out. */
export async function exportToSpotify(
  name: string,
  songs: { name: string; artists?: { name: string }[] }[],
  onProgress?: (done: number, total: number) => void
): Promise<ExportResult> {
  if (!spotifyHasScope('playlist-modify-private')) throw new SpotifyNeedsReconnect();
  const uris: (string | null)[] = new Array(songs.length).fill(null);
  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (cursor < songs.length) {
      const index = cursor++;
      const song = songs[index];
      await sleep(150);
      uris[index] = await findSpotifyUri(song.name, (song.artists ?? []).map((a) => a.name).join(' '));
      onProgress?.(++done, songs.length);
    }
  };
  await Promise.all(Array.from({ length: 2 }, worker));
  const found = [...new Set(uris.filter((uri): uri is string => !!uri))];
  if (found.length === 0) return { url: '', added: 0, requested: songs.length };
  const playlist: any = await spotifyGet('/me/playlists', {
    name,
    public: false,
    description: 'Sung with KKaraoke',
  });
  for (let i = 0; i < found.length; i += 100) {
    await spotifyGet(`/playlists/${encodeURIComponent(playlist.id)}/items`, { uris: found.slice(i, i + 100) });
  }
  return { url: playlist.external_urls?.spotify ?? '', added: found.length, requested: songs.length };
}
