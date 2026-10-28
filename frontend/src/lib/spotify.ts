import { create } from 'zustand';
import { api } from 'src/utils/api';
import type { Collection, Track } from 'src/models/spotify';

/**
 * Spotify connection for importing playlists. The browser signs in with Spotify (authorization code + PKCE, so no
 * secret is involved), reads the user's own playlists, and sends only song titles and artists to our API, which
 * matches them to recordings we can play. Tokens stay in this browser.
 */
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const SCOPES = 'playlist-read-private playlist-read-collaborative';
const STORE = 'spotifyAuth';
const VERIFIER = 'spotifyVerifier';

/** Spotify only redirects to http(s), so the desktop app's file:// pages cannot connect. */
export const spotifyAvailable = !!CLIENT_ID && /^https?:$/.test(window.location.protocol);

interface Stored {
  access: string;
  refresh?: string;
  expires: number;
}

const redirectUri = () => `${window.location.origin}/spotify/callback`;

function load(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null');
  } catch {
    return null;
  }
}

function save(token: { access_token: string; refresh_token?: string; expires_in: number }, previous?: Stored | null) {
  const stored: Stored = {
    access: token.access_token,
    refresh: token.refresh_token ?? previous?.refresh,
    expires: Date.now() + token.expires_in * 1000 - 30_000,
  };
  try {
    localStorage.setItem(STORE, JSON.stringify(stored));
  } catch {
    /* storage blocked: the connection lasts until the page closes */
  }
  return stored;
}

export const isSpotifyConnected = () => !!load();

export function disconnectSpotify() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* nothing stored */
  }
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function connectSpotify() {
  if (!spotifyAvailable) return;
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

async function spotifyGet(url: string) {
  const response = await fetch(url.startsWith('http') ? url : `https://api.spotify.com/v1${url}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
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

/** A playlist's songs matched to playable recordings, a batch at a time. Songs we cannot match are left out. */
export async function importSpotifyPlaylist(id: string): Promise<{ collection: Collection; tracks: Track[] }> {
  useImportProgress.setState({ done: 0, total: 0 });
  const meta = await spotifyGet(`/playlists/${encodeURIComponent(id)}?fields=name,images,description,owner(display_name)`);
  const entries: { title: string; artist: string }[] = [];
  let next: string | null = `/playlists/${encodeURIComponent(id)}/items?limit=100`;
  while (next && entries.length < 200) {
    const page: any = await spotifyGet(next);
    for (const row of page.items ?? []) {
      const song = row?.item ?? row?.track; // `track` is the pre-2026 field name
      if (!song || song.type === 'episode' || !song.name) continue;
      entries.push({ title: song.name, artist: (song.artists ?? []).map((a: { name: string }) => a.name).join(', ') });
    }
    next = page.next;
  }
  useImportProgress.setState({ done: 0, total: entries.length });
  const tracks: Track[] = [];
  const seen = new Set<string>();
  let collection: Collection | null = null;
  for (let i = 0; i < entries.length; i += BATCH) {
    const { data } = await api.post(
      '/import/resolve',
      { name: meta.name ?? 'Spotify', owner: meta.owner?.display_name || 'Spotify', entries: entries.slice(i, i + BATCH) },
      { timeout: 90_000 }
    );
    collection ??= data.collection;
    for (const track of data.tracks as Track[]) {
      if (!seen.has(track.id)) {
        seen.add(track.id);
        tracks.push(track);
      }
    }
    useImportProgress.setState({ done: Math.min(i + BATCH, entries.length) });
  }
  const cover = meta.images?.[0]?.url;
  return {
    collection: {
      ...(collection ?? ({} as Collection)),
      id,
      name: meta.name ?? 'Spotify',
      description: meta.description ?? '',
      owner: { displayName: meta.owner?.display_name ?? 'Spotify' },
      images: cover ? [{ url: cover }] : (collection?.images ?? []),
      tracks: { total: tracks.length },
      importStats: { matched: tracks.length, requested: entries.length },
    } as Collection,
    tracks,
  };
}
