/** A wait between two lines at least this long (seconds) gets a countdown for its last seconds. */
export const GAP_MIN_S = 5;

type GapLine = { time: number; text: string; end?: number | null; words?: { end: number }[] | null };

/** The guess for a line without word timing: this long for every character, and at least this long (seconds). Keep the Mac app's (Lyrics.swift) the same. */
export const GUESS_S_PER_CHAR = 0.75;
export const GUESS_MIN_S = 4;

/**
 * Seconds a line without word timing is guessed to take to sing. Generous on purpose: a countdown
 * that starts while the line is still being sung is worse than one that starts a little late.
 */
function guessedDuration(text: string): number {
  return Math.max(GUESS_MIN_S, text.length * GUESS_S_PER_CHAR);
}

/** Aligned word ends run early (the last word is often held), so the wait starts a moment after it (better to show the countdown late than while the word is still held). */
export const WORD_END_GRACE_S = 1.8;

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
    let sung = words?.length ? words[words.length - 1].end + delay + WORD_END_GRACE_S : line.time + guessedDuration(line.text);
    // The line's own end, when there is one, says the singing lasts at least that long, whatever the words say
    // (a long line often has words that stop before it does).
    if (typeof line.end === 'number') sung = Math.max(sung, line.end + delay + WORD_END_GRACE_S);
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
