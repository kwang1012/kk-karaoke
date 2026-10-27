/** A wait between two lines at least this long (seconds) gets a countdown for its last seconds. */
export const GAP_MIN_S = 5;

type GapLine = { time: number; text: string; words?: { end: number }[] | null };

/**
 * Seconds a line without word timing is guessed to take to sing. Generous on purpose: a countdown
 * that starts while the line is still being sung is worse than one that starts a little late.
 */
function guessedDuration(text: string): number {
  return Math.max(3, text.length * 0.5);
}

/** Aligned word ends run early (the last word is often held), so the wait starts a moment after it. */
export const WORD_END_GRACE_S = 0.8;

/**
 * The silent stretch after line `index` (-1 for the intro before the first line), or null when it is
 * shorter than `GAP_MIN_S`. An instrumental (empty) line is its own marker, so no wait is counted
 * out into or after one. Line times are already shifted by `delay`; word times are not.
 */
export function gapAfter(lines: GapLine[], index: number, delay: number): { start: number; end: number } | null {
  const next = lines[index + 1];
  if (!next || !next.text) return null;
  let start = 0;
  if (index >= 0) {
    const line = lines[index];
    if (!line.text) return null;
    const words = line.words;
    const sung = words?.length ? words[words.length - 1].end + delay + WORD_END_GRACE_S : line.time + guessedDuration(line.text);
    start = Math.min(sung, next.time);
  }
  return next.time - start >= GAP_MIN_S ? { start, end: next.time } : null;
}

/** Only the last seconds of the wait are counted out. */
export const COUNTDOWN_S = 3;

/** Seconds left until the next line once the wait is down to its last `COUNTDOWN_S`, else null. */
export function countdown(gap: { start: number; end: number }, progress: number): number | null {
  const left = gap.end - progress;
  return progress >= gap.start && left > 0 && left <= COUNTDOWN_S ? left : null;
}
