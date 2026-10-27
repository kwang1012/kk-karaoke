/**
 * One device of an account plays the audio for its room; the others show the same queue, lyrics and position and
 * act as remotes. The server says which: a device id, nobody (null), or not yet known (undefined).
 */
export function isActiveDevice(active: string | null | undefined, me: string, roomId?: string): boolean {
  if (roomId === 'default') return true; // the shared room has no owner to pick one
  return active === undefined || active === me; // unknown plays as before; the server filters a stale player's reports
}
