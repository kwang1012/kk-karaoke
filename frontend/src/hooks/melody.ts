import { useEffect, useState } from 'react';
import { fetchMelody, type MelodyNote } from 'src/apis/player';

const RETRY_MS = 4000;
const MAX_TRIES = 30;
const cache = new Map<string, MelodyNote[]>();

/** loading: asking; waiting: the server is still finding it; ready; none: the song has no notes; gaveUp: it never came. */
export type MelodyState = 'idle' | 'loading' | 'waiting' | 'ready' | 'none' | 'gaveUp';

/** The melody of a song, sorted by start. Songs processed before melodies existed are worked out on first request, so this waits for them. */
export function useMelody(trackId: string | undefined, enabled: boolean): { notes: MelodyNote[]; state: MelodyState } {
  const [melody, setMelody] = useState<MelodyNote[]>([]);
  const [state, setState] = useState<MelodyState>('idle');

  useEffect(() => {
    if (!trackId || !enabled) {
      setMelody([]);
      setState('idle');
      return;
    }
    const cached = cache.get(trackId);
    if (cached) {
      setMelody(cached);
      setState(cached.length ? 'ready' : 'none');
      return;
    }
    setMelody([]);
    setState('loading');
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async (tries: number) => {
      let notes: MelodyNote[] | null;
      try {
        notes = await fetchMelody(trackId);
      } catch (error) {
        console.error('Error reading the melody:', error);
        if (!cancelled) setState('gaveUp');
        return;
      }
      if (cancelled) return;
      if (notes === null) {
        setState(tries < MAX_TRIES ? 'waiting' : 'gaveUp');
        if (tries < MAX_TRIES) timer = setTimeout(() => attempt(tries + 1), RETRY_MS);
        return;
      }
      const sorted = [...notes].sort((a, b) => a.start - b.start);
      cache.set(trackId, sorted);
      setMelody(sorted);
      setState(sorted.length ? 'ready' : 'none');
    };
    attempt(1);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trackId, enabled]);

  return { notes: melody, state };
}
