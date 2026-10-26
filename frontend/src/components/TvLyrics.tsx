import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Lyrics } from 'src/models/spotify';
import WordLine from './WordLine';
import LyricGap from './LyricGap';
import { countdown, gapAfter } from 'src/lyricGap';

/** Keep each line mounted as it moves into and out of the singing position. */
export default function TvLyrics({ lyrics, lineIndex, delay, progress, playing, seeking }: {
  lyrics: Lyrics[];
  lineIndex: number;
  delay: number;
  progress: number;
  playing: boolean;
  seeking: boolean;
}) {
  const previous = useRef(lineIndex);
  const animate = !seeking && Math.abs(lineIndex - previous.current) <= 1;
  useEffect(() => { previous.current = lineIndex; }, [lineIndex]);
  const container = useRef<HTMLDivElement>(null);
  const lines = useRef(new Map<number, HTMLDivElement>());
  const [measurements, setMeasurements] = useState({ height: 0, width: 0, lines: new Map<number, number>() });
  // a long wait before the next line: once it is down to its last seconds the next line moves into
  // the singing position, with the countdown dots in the room it leaves above
  const wait = gapAfter(lyrics, lineIndex, delay);
  const remaining = wait ? countdown(wait, progress) : null;
  const focus = remaining === null ? lineIndex : lineIndex + 1;
  const first = Math.max(-1, focus - 3);
  const last = Math.min(lyrics.length - 1, focus + 3);

  // Measure unscaled text, including wrapping, before positioning neighbouring lines.
  useLayoutEffect(() => {
    const measure = () => {
      if (!container.current) return;
      const heights = new Map(Array.from(lines.current, ([index, node]) => [index, node.offsetHeight]));
      const { clientHeight: height, clientWidth: width } = container.current;
      setMeasurements((old) => old.height === height && old.width === width
        && old.lines.size === heights.size && Array.from(heights).every(([index, value]) => old.lines.get(index) === value)
        ? old : { height, width, lines: heights });
    };
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    lines.current.forEach((node) => observer.observe(node));
    measure();
    return () => observer.disconnect();
  }, [first, last, lyrics]);

  const sizes = new Map<number, { height: number; scale: number }>();
  for (let index = first; index <= last; index++) {
    const height = measurements.lines.get(index) || measurements.width * 0.064;
    const emphasis = index === focus ? 1 : index === focus + 1 ? 0.65 : 0.55;
    const scale = Math.min(emphasis, measurements.height ? measurements.height * 0.42 / height : emphasis);
    sizes.set(index, { height: height * scale, scale });
  }
  const gap = measurements.width * 0.016;
  const positions = new Map([[focus, 0]]);
  for (const direction of [-1, 1]) {
    for (let index = focus + direction; index >= first && index <= last; index += direction) {
      const neighbour = index - direction;
      positions.set(index, (positions.get(neighbour) || 0) + direction * (
        (sizes.get(neighbour)?.height || 0) / 2 + gap + (sizes.get(index)?.height || 0) / 2
      ));
    }
  }

  return (
    <div ref={container} className="relative h-[34vw] max-h-full w-full overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_88%,transparent)]">
      {Array.from({ length: last - first + 1 }, (_, offset) => {
        const index = first + offset;
        const relative = index - focus;
        const line = lyrics[index];
        const active = index === lineIndex;
        const y = positions.get(index) || 0;
        const scale = sizes.get(index)?.scale || 1;
        const opacity = relative === 0 ? 1 : relative === 1 ? 0.6
          : relative === -1 && remaining !== null ? 0 // the dots' room
          : Math.abs(relative) <= 2 ? 0.3 : 0;
        return (
          <div
            key={index}
            ref={(node) => { if (node) lines.current.set(index, node); else lines.current.delete(index); }}
            aria-current={active ? 'true' : undefined}
            className="absolute inset-x-0 top-[45%] origin-center text-center text-[4.8vw] [overflow-wrap:anywhere] leading-tight font-extrabold motion-reduce:transition-none!"
            style={{
              transform: `translate3d(0, calc(-50% + ${y}px), 0) scale(${scale})`,
              opacity,
              transitionProperty: animate ? 'transform, opacity' : 'none',
              transitionDuration: '420ms',
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {line?.words?.length ? (
              <WordLine words={line.words} delay={delay} progress={progress} playing={playing} dimColor="rgba(255,255,255,0.55)" />
            ) : line?.text || '♪'}
          </div>
        );
      })}
      {remaining !== null && (
        <LyricGap
          remaining={remaining}
          className="absolute inset-x-0 top-[45%] justify-center text-[3.2vw] transition-transform"
          style={{ transform: `translate3d(0, calc(-50% + ${(positions.get(focus - 1) || 0)}px), 0)` }}
        />
      )}
    </div>
  );
}
