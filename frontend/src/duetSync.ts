// A duet is anchored on the server's clock: the song is `from` seconds in at server time `startAt` (ms). Every device
// derives its own position from that, so a device that hears about it late, or joins halfway, still lands in step.
export type DuetStart = { trackId: string; from: number; startAt: number };

/** Seconds into the song at server time `serverNow`; before the start it waits at `from`. */
export function duetPosition(duet: DuetStart, serverNow: number): number {
  return duet.from + Math.max(0, serverNow - duet.startAt) / 1000;
}

/** Read the duet out of a room snapshot (`GET /room`) or a `duet` message; null when none is running. */
export function duetFrom(data: any): DuetStart | null {
  const trackId = data?.trackId ?? data?.duetTrack;
  const startAt = data?.startAt ?? data?.duetAt;
  const from = data?.from ?? data?.duetFrom ?? 0;
  if (typeof trackId !== 'string' || !trackId) return null;
  if (typeof startAt !== 'number' || !(startAt > 0) || typeof from !== 'number' || !(from >= 0)) return null;
  return { trackId, from, startAt };
}
