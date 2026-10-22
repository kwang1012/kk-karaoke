/** Shortest fill, so a word with a zero-length timing still lights up. */
const MIN_FILL_S = 0.05;

/**
 * How much of a word is sung (0..1) at `progress`. A word never keeps filling after the next one has started,
 * so two words are not lit at the same time when the data runs one into the other.
 */
export function wordFill(
  word: { start: number; end: number },
  next: { start: number } | undefined,
  delay: number,
  progress: number
): number {
  const start = word.start + delay;
  let end = Math.max(word.end + delay, start + MIN_FILL_S);
  if (next) end = Math.max(Math.min(end, next.start + delay), start + 0.01);
  return progress <= start ? 0 : progress >= end ? 1 : (progress - start) / (end - start);
}
