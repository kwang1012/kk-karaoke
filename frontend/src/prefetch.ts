/** How long a prefetched result is trusted: whatever changes the data meanwhile (an edit, a re-sync) is seen after that. */
export const PREFETCH_TTL_MS = 60_000;

/**
 * Fetch things before they are asked for. A prefetched result is used once, and only while it is fresh; a failed
 * or expired one is simply fetched again, so prefetching can make a request earlier but never worse.
 */
export function createPrefetcher<T>(
  fetcher: (id: string) => Promise<T | undefined>,
  ttlMs: number = PREFETCH_TTL_MS,
  now: () => number = Date.now
) {
  const waiting = new Map<string, { at: number; result: Promise<T | undefined> }>();
  return {
    prefetch(id: string): void {
      for (const [key, entry] of waiting) if (now() - entry.at >= ttlMs) waiting.delete(key); // nobody came for it
      if (!waiting.has(id)) waiting.set(id, { at: now(), result: fetcher(id).catch(() => undefined) });
    },
    async get(id: string): Promise<T | undefined> {
      const entry = waiting.get(id);
      waiting.delete(id);
      if (entry && now() - entry.at < ttlMs) {
        const result = await entry.result;
        if (result !== undefined) return result;
      }
      return fetcher(id);
    },
  };
}
