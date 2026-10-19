import { useEffect, useMemo, useRef, useState } from 'react';
import AppScrollbar from 'src/components/Scrollbar';
import { usePlayer } from 'src/store/player';
import { useTrackStore } from 'src/store';
import { DEFAULT_BG_COLOR, DEFAULT_COLOR, getLyricsRGB } from 'src/utils';
import { Maximize, Minimize } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import { useThemeMode } from 'src/hooks/theme';
import { cn } from 'src/lib/utils';
import { useSettingStore } from 'src/store/setting';
import AudioController from 'src/components/AudioController';
import { useIdle } from 'src/hooks/idle';
import LyricsOffset from 'src/components/LyricsOffset';
import { useLyricsOffset } from 'src/hooks/lyricsOffset';
import { useT } from 'src/i18n';

export default function LyricsView() {
  const t = useT();
  // local states
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const { progress, currentLine, setCurrentLine, currentTrack, lyrics, seeking, loading } = usePlayer();
  const { seek } = usePlayer();
  const lyricsDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);
  // How many seconds earlier the lyrics are shown, derived from the shared per-track delay.
  const { ahead, setAhead } = useLyricsOffset();
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

  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG_COLOR);
  const image = currentTrack?.album?.images?.[0]?.url;
  const mode = useThemeMode();
  const isFullscreen = useSettingStore((state) => state.isFullScreen);
  // in fullscreen the controls fade away after a few seconds without input
  const idle = useIdle(3000, isFullscreen);
  const showTranslatinon = useSettingStore((state) => state.showTranslatinon);
  const scrollbarRef = useRef<HTMLDivElement>(null);

  // Set the document title to the current song name and artist
  useEffect(() => {
    if (!currentTrack) return;
    document.title = `${currentTrack.name}．${currentTrack.artists.map((artist) => artist.name).join('、')} - Lyrics`;
  }, [currentTrack]);

  // Set the lineRefs to null when the lyrics change
  useEffect(() => {
    lineRefs.current = Array(lyrics?.length || 0).map(() => null);
  }, [lyrics]);

  // Set the color and background color based on the image
  useEffect(() => {
    if (!image) {
      setColor(DEFAULT_COLOR);
      setBgColor(DEFAULT_BG_COLOR);
      return;
    }
    getLyricsRGB(image, mode === 'light')
      .then(({ lyrics, background }) => {
        setColor(lyrics);
        setBgColor(background);
      })
      .catch((error) => {
        console.error('Error fetching average RGB:', error);
      });
  }, [image, mode]);

  // Scroll to the current line when the progress changes
  useEffect(() => {
    const el = lineRefs.current[currentLine];
    const scrollbar = scrollbarRef.current;
    if (!el || !scrollbar) return;
    const viewport = scrollbar;

    const elTop = el.offsetTop;
    const elHeight = el.offsetHeight;
    const viewportHeight = viewport.offsetHeight;

    viewport.scrollTo({
      top: elTop - viewportHeight / 2 + elHeight / 2,
      behavior: 'smooth',
    });
  }, [currentLine, lineRefs.current.length, isFullscreen]);

  // Update the current line based on the progress
  useEffect(() => {
    const index = syncedLyrics.findIndex((line, i) => {
      return progress >= line.time && (i === syncedLyrics.length - 1 || progress < syncedLyrics[i + 1].time);
    });
    if (index !== currentLine && !seeking) {
      setCurrentLine(index);
    }
  }, [progress, seeking, syncedLyrics]);

  const handleLineClick = async (index: number) => {
    const seekTime = syncedLyrics[index].time;
    seek(seekTime);
  };
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (isFullscreen) {
        document.exitFullscreen();
      } else {
        const el = document.documentElement;

        if (el.requestFullscreen) {
          el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          (el as any).webkitRequestFullscreen(); // Safari
        } else if ((el as any).msRequestFullscreen) {
          (el as any).msRequestFullscreen(); // IE11
        }
      }
    }
  };
  return (
    <>
      <div className={cn(isFullscreen ? 'fixed inset-0 z-11' : 'h-full w-full', isFullscreen && idle && 'cursor-none')}>
        <div className="relative w-full h-full" ref={containerRef}>
          {!isFullscreen && (
            <div className="absolute bottom-4 left-4 z-12">
              <LyricsOffset value={ahead} onChange={setAhead} />
            </div>
          )}
          {currentTrack?.orderedBy && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-full bg-black/30 py-1 pr-4 pl-1 backdrop-blur">
              <img src={currentTrack.orderedBy.avatar} className="size-9 rounded-full" alt={currentTrack.orderedBy.name} />
              <span className="text-sm font-semibold text-white">{currentTrack.orderedBy.name}</span>
            </div>
          )}
          {!isFullscreen && (
            <div className="absolute right-4 bottom-4 z-10">
              <IconButton
                aria-label={t('lyrics.fullscreen')}
                className="bg-black/30 text-white backdrop-blur hover:bg-black/50"
                onClick={toggleFullscreen}
              >
                <Maximize className="size-6" />
              </IconButton>
            </div>
          )}
          {isFullscreen && (
            <div
              className={cn(
                'absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-6 pt-24 pb-5 transition-opacity duration-300',
                idle && 'pointer-events-none opacity-0'
              )}
            >
              <div className="mx-auto max-w-6xl">
                <div className="mb-3 flex items-center justify-between">
                  <LyricsOffset value={ahead} onChange={setAhead} />
                  <IconButton
                    aria-label={t('lyrics.exitFullscreen')}
                    className="bg-black/40 text-white backdrop-blur hover:bg-black/60"
                    onClick={toggleFullscreen}
                  >
                    <Minimize className="size-6" />
                  </IconButton>
                </div>
                <div className="h-[84px]">
                  <AudioController />
                </div>
              </div>
            </div>
          )}
          <AppScrollbar
            ref={scrollbarRef}
            className={['w-full h-full px-10', isFullscreen ? 'py-[25%]' : ''].join(' ')}
            style={{ color, backgroundColor: bgColor }}
          >
            {syncedLyrics.length > 0 ? (
              syncedLyrics.map((line, i) => (
                <div key={i} className={['my-6 mx-16', isFullscreen ? 'text-center' : ''].join(' ')}>
                  <span
                    className={[
                      'origin-left cursor-pointer text-[2.5vw] leading-snug font-bold transition-all duration-300 hover:opacity-100',
                      i <= currentLine ? 'text-white' : 'opacity-70',
                      i === currentLine && !isFullscreen && 'scale-[1.04]',
                      isFullscreen ? 'text-center text-[3vw]' : '',
                      isFullscreen && (i === currentLine ? 'text-[5vw] opacity-100' : 'opacity-70'),
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
            ) : (
              <div className="mt-24 text-center text-3xl font-bold" style={{ color }}>
                {!loading && <p>{currentTrack ? t('lyrics.none') : t('lyrics.start')}</p>}
              </div>
            )}
          </AppScrollbar>
        </div>
      </div>
    </>
  );
}
