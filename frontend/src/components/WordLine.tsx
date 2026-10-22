import { useEffect, useReducer, useRef } from 'react';
import { LyricWord } from 'src/models/spotify';
import { extrapolate, wordFill } from 'src/wordFill';

/**
 * The line being sung, filled in word by word. `progress` only moves every 200 ms, so between reports the
 * time is read from the clock: each word fills in real time and is full exactly when the next one starts.
 * (Easing each step instead left the old word still filling as the next one began.)
 */
export default function WordLine({
  words,
  delay,
  progress,
  playing = true,
  dimColor,
}: {
  words: LyricWord[];
  delay: number;
  progress: number;
  /** A paused song stands still. */
  playing?: boolean;
  /** Colour of words not yet sung. */
  dimColor: string;
}) {
  const anchor = useRef({ progress, at: performance.now() });
  if (anchor.current.progress !== progress) anchor.current = { progress, at: performance.now() };
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // Animate only while a word is being sung: the other lines are all lit or all dim.
  const first = words[0]?.start ?? 0;
  const last = words[words.length - 1]?.end ?? 0;
  const live = playing && progress >= first + delay - 0.5 && progress <= last + delay + 0.5;
  useEffect(() => {
    if (!live) return;
    let frame = 0;
    const loop = () => {
      redraw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [live]);
  const now = extrapolate(progress, performance.now() - anchor.current.at, playing);

  return (
    <>
      {words.map((word, i) => {
        const sung = wordFill(word, words[i + 1], delay, now);
        return (
          <span
            key={i}
            className="whitespace-pre-wrap"
            style={{
              color: 'transparent',
              backgroundImage: `linear-gradient(#fff, #fff), linear-gradient(${dimColor}, ${dimColor})`,
              backgroundSize: `${sung * 100}% 100%, 100% 100%`,
              backgroundRepeat: 'no-repeat',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
            }}
          >
            {word.text}
          </span>
        );
      })}
    </>
  );
}
