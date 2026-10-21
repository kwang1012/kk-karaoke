export type ErrorKind = 'timeout' | 'offline' | 'notFound' | 'server' | 'unknown';

/** What went wrong with a request, from the error axios threw (kept free of the UI so it can be tested). */
export function errorKind(error: unknown): ErrorKind {
  const e = error as { code?: string; message?: string; response?: { status?: number } } | null;
  const status = e?.response?.status;
  if (status === undefined) {
    if (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT' || /timeout/i.test(e?.message ?? '')) return 'timeout';
    if (e?.code === 'ERR_NETWORK' || /network error/i.test(e?.message ?? '')) return 'offline';
    return 'unknown';
  }
  if (status === 404) return 'notFound';
  if (status >= 500) return 'server';
  return 'unknown';
}
