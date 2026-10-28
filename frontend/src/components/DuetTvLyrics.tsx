import { useEffect, useRef } from 'react';
import type { Lyrics } from 'src/models/spotify';
import { activeLyricIndices, singerColor, singerSide } from 'src/duetLyrics';
import VocalLabel from './VocalLabel';
import WordLine from './WordLine';

/** Keep every overlapping vocal part visible, with the next turn below it. */
export default function DuetTvLyrics({ lyrics, lineIndex, delay, progress, playing }: {
  lyrics: Lyrics[]; lineIndex: number; delay: number; progress: number; playing: boolean;
}) {
  const active = activeLyricIndices(lyrics, progress, delay);
  const focus = active.size ? Math.min(...active) : Math.max(0, lineIndex);
  const visible = new Set([...active, ...Array.from({ length: 3 }, (_, i) => Math.max(0, lineIndex) + i)]);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => { anchor.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); }, [focus, lineIndex]);
  return <div className="h-[34vw] max-h-full w-full overflow-y-auto [scrollbar-width:none] [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_88%,transparent)]">
    <div className="flex min-h-full flex-col justify-center gap-[1.8vw] px-[4%] py-[4vw]">
      {[...visible].filter((i) => i < lyrics.length).sort((a, b) => a - b).map((i) => {
        const line = lyrics[i];
        const side = singerSide(line.singer);
        const singing = active.has(i);
        return <div key={line.id || i} ref={i === focus ? anchor : undefined} aria-current={singing ? 'true' : undefined}
          className="w-[85%] shrink-0 text-[3.8vw] leading-tight font-extrabold [overflow-wrap:anywhere]"
          style={{ alignSelf: side === 'left' ? 'flex-start' : side === 'right' ? 'flex-end' : 'center', textAlign: side,
            opacity: singing ? 1 : 0.45, color: singerColor(line.singer) }}>
          <VocalLabel line={line} previous={lyrics[i - 1]} />
          {line.words?.length ? <WordLine words={line.words} delay={delay} progress={progress} playing={playing}
            dimColor="rgba(255,255,255,0.45)" highlightColor={singerColor(line.singer)} /> : line.text || '♪'}
        </div>;
      })}
    </div>
  </div>;
}
