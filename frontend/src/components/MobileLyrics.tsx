import AppScrollbar from './Scrollbar';
import LyricsSkeleton from './LyricsSkeleton';
import PlainLyrics from './PlainLyrics';
import { useState, useRef, useMemo, useEffect } from 'react';
import { usePlayer } from 'src/store/player';
import placeholder from 'src/assets/placeholder.png';
import { useTrackStore } from 'src/store';
import { useSettingStore } from 'src/store/setting';
import { useT } from 'src/i18n';

export default function MobileLyrics({ color, bgColor }: { color?: string; bgColor?: string }) {
  const t = useT();
  // local states
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const { progress, currentLine, setCurrentLine, currentTrack, lyrics, seeking, loading } = usePlayer();
  const { seek } = usePlayer();
  const lyricsDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);
  const plain = useTrackStore((state) => state.plainLyrics[currentTrack?.id || '']);
  const syncedLyrics = useMemo(() => {
    return (
      lyrics?.map((line) => {
        return {
          ...line,
          time: line.time + lyricsDelay,
        };
      }) || []
    );
  }, [lyrics, lyricsDelay]);

  useEffect(() => {
    lineRefs.current = Array(lyrics.length).map(() => null);
  }, [lyrics]);

  const showTranslatinon = useSettingStore((state) => state.showTranslatinon);
  const [scrollTop, setScrollTop] = useState(0);
  const sticky = scrollTop > 0;

  useEffect(() => {
    const el = lineRefs.current[currentLine];
    const container = containerRef.current;
    if (!el || !container) return;
    const viewport = container;

    const elTop = el.offsetTop;
    const elHeight = el.offsetHeight;
    const viewportHeight = viewport.offsetHeight;

    viewport.scrollTo({
      top: elTop - viewportHeight / 2 - elHeight / 2,
      behavior: 'smooth',
    });
  }, [currentLine, lineRefs.current]);

  useEffect(() => {
    if (!currentTrack) return;
    document.title = `${currentTrack.name}．${currentTrack.artists.map((artist) => artist.name).join('、')} - Lyrics`;
  }, [currentTrack]);

  useEffect(() => {
    const index = syncedLyrics.findIndex((line, i) => {
      return progress >= line.time && (i === syncedLyrics.length - 1 || progress < syncedLyrics[i + 1].time);
    });
    if (index !== currentLine && !seeking) {
      setCurrentLine(index);
    }
  }, [progress, seeking]);

  const handleLineClick = async (index: number) => {
    const seekTime = syncedLyrics[index].time;
    seek(seekTime);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  };
  return (
    <AppScrollbar
      ref={containerRef}
      onScroll={handleScroll}
      className="w-full h-full py-3"
      style={{ color, backgroundColor: bgColor }}
    >
      {sticky && (
        <div
          className="fixed inset-x-0 top-0 z-[1] h-[84px] shadow-md"
          style={{
            background: bgColor,
          }}
        />
      )}
      <div className="sticky top-0 flex items-center w-full z-50 px-6">
        <div className="w-16 h-16 rounded-md bg-[#c3c3c3] overflow-hidden">
          <img src={currentTrack?.album?.images?.[0]?.url || placeholder} className="w-full h-full" />
        </div>
        <span className="text-xl ml-2 text-white">{currentTrack?.name || t('common.notPlaying')}</span>
      </div>
      {syncedLyrics.length > 0 ? (
        syncedLyrics.map((line, i) => (
          <div key={i} className="m-5">
            <span
              className={[
                'text-2xl cursor-pointer font-bold transition-all duration-200',
                i <= currentLine ? 'text-white' : '',
              ].join(' ')}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              onClick={handleLineClick.bind(null, i)}
            >
              {line.text === '' ? '♪' : line.text}

              {line.romanized && showTranslatinon && (
                <>
                  <br />
                  <span className="text-[0.8em]">({line.romanized})</span>
                </>
              )}
            </span>
          </div>
        ))
      ) : plain ? (
        <PlainLyrics text={plain} className="m-5 text-2xl" />
      ) : (
        <div className="text-center mt-20 text-4xl font-bold" style={{ color }}>
          {loading ? <LyricsSkeleton className="px-2 py-0" /> : <p>{currentTrack ? t('lyrics.none') : t('lyrics.start')}</p>}
        </div>
      )}
    </AppScrollbar>
  );
}
