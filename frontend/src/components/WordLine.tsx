import { LyricWord } from 'src/models/spotify';

/**
 * The line being sung, filled in word by word. `progress` only moves every 200ms, so each
 * word's fill is eased over that step to look continuous.
 */
export default function WordLine({
  words,
  delay,
  progress,
  dimColor,
}: {
  words: LyricWord[];
  delay: number;
  progress: number;
  /** Colour of words not yet sung. */
  dimColor: string;
}) {
  return (
    <>
      {words.map((word, i) => {
        const start = word.start + delay;
        const end = Math.max(word.end + delay, start + 0.05);
        const sung = progress <= start ? 0 : progress >= end ? 1 : (progress - start) / (end - start);
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
              transition: 'background-size 200ms linear',
            }}
          >
            {word.text}
          </span>
        );
      })}
    </>
  );
}
