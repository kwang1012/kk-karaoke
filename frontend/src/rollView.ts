import type { Note } from './scoring.ts';

/** The pitch rows the roll shows, as MIDI numbers (fractional while it eases from one view to the next). */
export type View = { lo: number; hi: number };

/** Never show fewer rows than an octave, so a few notes do not turn into enormous bars. */
export const MIN_ROWS = 12;
/** Rows kept free above and below the notes. */
const PADDING = 2.5;

/**
 * The rows that the notes between `from` and `to` need (`notes` are sorted by start), so each semitone gets
 * as much height as possible. Notes beyond the song's usual range (`song`, before the key shift) are stray;
 * they sit on the edge of the view instead of stretching it.
 */
export function viewFor(notes: readonly Note[], from: number, to: number, shift: number, song: { low: number; high: number }): View {
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    if (n.end < from) continue;
    if (n.start > to) break;
    if (n.note < song.low || n.note > song.high) continue; // stray: not a reason to change the view
    lo = Math.min(lo, n.note);
    hi = Math.max(hi, n.note);
  }
  if (lo > hi) {
    lo = song.low;
    hi = song.high;
  }
  lo += shift - PADDING;
  hi += shift + PADDING;
  if (hi - lo < MIN_ROWS) {
    const middle = (lo + hi) / 2;
    lo = middle - MIN_ROWS / 2;
    hi = middle + MIN_ROWS / 2;
  }
  return { lo, hi };
}

/** A step from `view` toward `target`: `k` is the share of the distance covered (1 jumps there). */
export function ease(view: View, target: View, k: number): View {
  return { lo: view.lo + (target.lo - view.lo) * k, hi: view.hi + (target.hi - view.hi) * k };
}

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
export const isBlackKey = (midi: number): boolean => BLACK_KEYS.has(((midi % 12) + 12) % 12);

/** Scientific pitch name of a C (the label on the roll's octave lines): 60 is C4. */
export const octaveLabel = (midi: number): string => `C${Math.floor(midi / 12) - 1}`;
