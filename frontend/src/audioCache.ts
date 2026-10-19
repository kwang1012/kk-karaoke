import { api } from './utils/api';

const CACHE_NAME = 'kk-audio-v1';
/** Two stems per song, so this keeps roughly the last 12 songs available offline/instantly. */
const MAX_ENTRIES = 24;

export type Progress = (loaded: number, total: number) => void;
type Kind = 'vocal' | 'instrumental';

/**
 * Where stems are fetched from. Set VITE_AUDIO_BASE_URL to the public R2 bucket / CDN domain
 * (objects are `<kind>/<id>.mp3`) to bypass the API; otherwise the API serves them.
 */
export function audioUrl(kind: Kind, trackId: string) {
  const base = import.meta.env.VITE_AUDIO_BASE_URL as string | undefined;
  return base ? `${base.replace(/\/$/, '')}/${kind}/${trackId}.mp3` : `${api.getUri()}/tracks/${kind}/${trackId}`;
}

type Entry = { promise: Promise<ArrayBuffer>; listeners: Set<Progress> };
const inflight = new Map<string, Entry>();

const openCache = (): Promise<Cache | null> =>
  ('caches' in globalThis ? caches.open(CACHE_NAME) : Promise.resolve(null)).catch(() => null);

async function trim(cache: Cache) {
  const keys = await cache.keys(); // insertion order, oldest first
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)).map((key) => cache.delete(key)));
}

async function download(url: string, notify: Progress): Promise<ArrayBuffer> {
  const cache = await openCache();
  const hit = await cache?.match(url);
  if (hit) {
    const buffer = await hit.arrayBuffer();
    notify(buffer.byteLength, buffer.byteLength);
    return buffer;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load audio (${res.status}): ${url}`);
  const total = Number(res.headers.get('Content-Length')) || 0;

  let buffer: ArrayBuffer;
  if (res.body) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      notify(loaded, total);
    }
    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    buffer = merged.buffer;
  } else {
    buffer = await res.arrayBuffer();
  }

  // Persist for later sessions. decodeAudioData detaches its input, so cache a copy.
  if (cache) {
    cache
      .put(url, new Response(buffer.slice(0), { headers: { 'Content-Type': 'audio/mpeg' } }))
      .then(() => trim(cache))
      .catch(() => {}); // quota errors etc. just mean no caching
  }
  return buffer;
}

/**
 * Fetch an audio file as an ArrayBuffer, served from the persistent Cache API when possible.
 * Concurrent calls for the same URL share one download and all receive progress.
 */
export function fetchAudio(url: string, onProgress?: Progress): Promise<ArrayBuffer> {
  let entry = inflight.get(url);
  if (!entry) {
    const listeners = new Set<Progress>();
    const promise = download(url, (loaded, total) => listeners.forEach((fn) => fn(loaded, total))).finally(() =>
      inflight.delete(url)
    );
    entry = { promise, listeners };
    inflight.set(url, entry);
  }
  if (onProgress) entry.listeners.add(onProgress);
  // every caller gets its own copy because decodeAudioData consumes the buffer it is given
  return entry.promise.then((buffer) => buffer.slice(0));
}
