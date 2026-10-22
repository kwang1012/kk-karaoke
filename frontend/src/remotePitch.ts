/**
 * What the room's singers are singing into their phones: the remote sends the pitch it hears a few
 * times a second, the screen that plays draws and scores it. Only the latest value matters, and a
 * value is only good for a moment: a pitch from a note ago is not what is being sung now.
 */

/** A pitch older than this was a note ago: silence. */
export const FRESH_MS = 300;
/** Somebody is singing into a phone if anything arrived this recently. */
export const ACTIVE_MS = 2000;

let latest = { hz: 0, at: -Infinity };

export function setRemotePitch(hz: number, now: number = performance.now()) {
  if (Number.isFinite(hz) && hz > 0) latest = { hz, at: now };
}

/** The pitch being sung into a phone right now, in Hz, or null. */
export function remotePitch(now: number = performance.now()): number | null {
  return now - latest.at <= FRESH_MS ? latest.hz : null;
}

/** Whether anyone is singing into a phone at the moment (even between notes). */
export function remoteActive(now: number = performance.now()): boolean {
  return now - latest.at <= ACTIVE_MS;
}

export function clearRemotePitch() {
  latest = { hz: 0, at: -Infinity };
}
