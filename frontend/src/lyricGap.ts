/** A wait between two lines at least this long (seconds) is marked with a music icon and a countdown. */
export const GAP_MIN_S = 5;

type GapLine = { time: number; text: string; words?: { end: number }[] | null };

/** Seconds a line without word timing is guessed to take to sing. */
function guessedDuration(text: string): number {
  return Math.max(2, text.length * 0.3);
}

/**
 * The silent stretch after line `index` (-1 for the intro before the first line), or null when it is
 * shorter than `GAP_MIN_S`. Line times are already shifted by `delay`; word times are not.
 */
export function gapAfter(lines: GapLine[], index: number, delay: number): { start: number; end: number } | null {
  const next = lines[index + 1];
  if (!next) return null;
  let start = 0;
  if (index >= 0) {
    const line = lines[index];
    const words = line.words;
    const sung = words?.length ? words[words.length - 1].end + delay : line.time + (line.text ? guessedDuration(line.text) : 0);
    start = Math.min(sung, next.time);
  }
  return next.time - start >= GAP_MIN_S ? { start, end: next.time } : null;
}

/** The number is shown only for the last seconds of the wait. */
export const COUNTDOWN_S = 3;

/** Whole seconds left on the countdown to the next line. */
export function countdown(gap: { end: number }, progress: number): number {
  return Math.max(1, Math.ceil(gap.end - progress));
}
