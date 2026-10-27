/**
 * The songs a device queued before its room became the account's room. The server moves a room only when the
 * account opened it as a jam, so otherwise the device carries them over itself, once, into an empty account room.
 */
interface Entry {
  recommended?: boolean;
}

export interface QueueIo<T extends Entry> {
  queue(room: string): Promise<{ tracks: T[]; index?: number }>;
  add(room: string, track: T): Promise<unknown>;
  setIndex(room: string, index: number): Promise<unknown>;
}

/** What to re-add: the songs people ordered (suggestions are made again), and where the current one lands. */
export function carried<T extends Entry>(tracks: T[], index = 0) {
  const own = tracks.filter((t) => !t.recommended);
  const before = tracks.slice(0, Math.max(index, 0) + 1).filter((t) => !t.recommended).length;
  return { own, index: Math.max(before - 1, 0) };
}

/** True when the old queue was copied over. Never touches an account room that already has songs. */
export async function carryQueue<T extends Entry>(from: string, to: string, io: QueueIo<T>): Promise<boolean> {
  if ((await io.queue(to)).tracks.length) return false;
  const old = await io.queue(from);
  const { own, index } = carried(old.tracks, old.index);
  if (!own.length) return false;
  for (const track of own) await io.add(to, track);
  if (index > 0) await io.setIndex(to, index);
  return true;
}
