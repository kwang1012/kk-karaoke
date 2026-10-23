import { useLyricsColors } from 'src/hooks/lyricsColors';
import { usePageTitle } from 'src/hooks/documentTitle';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import AppScrollbar from 'src/components/Scrollbar';
import { usePlayer } from 'src/store/player';
import { useTrackStore } from 'src/store';
import { Maximize, Minimize } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import { useThemeMode } from 'src/hooks/theme';
import { cn } from 'src/lib/utils';
import { useSettingStore } from 'src/store/setting';
import AudioController from 'src/components/AudioController';
import { useIdle } from 'src/hooks/idle';
import PitchRoll from 'src/components/PitchRoll';
import SingingButtons from 'src/components/SingingButtons';
import LyricsOffset from 'src/components/LyricsOffset';
import LyricsSkeleton from 'src/components/LyricsSkeleton';
import PlainLyrics from 'src/components/PlainLyrics';
import VideoBackdrop from 'src/components/VideoBackdrop';
import WordLine from 'src/components/WordLine';
import LyricGap from 'src/components/LyricGap';
import { countdown, gapAfter } from 'src/lyricGap';
import { useLyricsOffset } from 'src/hooks/lyricsOffset';
import { useVideoMode } from 'src/hooks/videoMode';
import { useT } from 'src/i18n';

export default function LyricsView() {
  const t = useT();
  // local states
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const { progress, playing, currentLine, setCurrentLine, currentTrack, lyrics, seeking, loading } = usePlayer();
  const { seek } = usePlayer();
  const trackDelay = useTrackStore((state) => state.lyricsDelays[currentTrack?.id || ''] || 0);
  const lyricsLead = useSettingStore((state) => state.lyricsLead);
  const lyricsDelay = trackDelay - lyricsLead; // the song's own offset, and the lead before the singing
  const plain = useTrackStore((state) => state.plainLyrics[currentTrack?.id || '']);
  // How many seconds earlier the lyrics are shown, derived from the shared per-track delay.
  const { ahead, setAhead, approximate, videoId } = useLyricsOffset();
  const { showVideo: showVideoSetting } = useVideoMode();
  const wordHighlight = useSettingStore((state) => state.wordHighlight);
  const overVideo = showVideoSetting && !!videoId;
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

  const image = currentTrack?.album?.images?.[0]?.url;
  const mode = useThemeMode();
  const isFullscreen = useSettingStore((state) => state.isFullScreen);
  // in fullscreen the controls fade away after a few seconds without input
  const idle = useIdle(3000, isFullscreen);
  const showTranslatinon = useSettingStore((state) => state.showTranslatinon);
  const scrollbarRef = useRef<HTMLDivElement>(null);

  usePageTitle(t('nav.lyrics'), currentTrack);

  // Set the lineRefs to null when the lyrics change
  useEffect(() => {
    lineRefs.current = Array(lyrics?.length || 0).map(() => null);
  }, [lyrics]);

  // Set the color and background color based on the image
  const { lyrics: color, background: bgColor } = useLyricsColors(image, mode === 'light');

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

  // the long waits between lines: the music icon always, the countdown while it is the current wait
  const gapMarker = (index: number) => {
    const gap = gapAfter(syncedLyrics, index, lyricsDelay);
    if (!gap) return null;
    const waiting = currentLine === index && progress >= gap.start && progress < gap.end;
    return (
      <LyricGap
        key={`gap-${index}`}
        seconds={waiting ? countdown(gap, progress) : null}
        className={cn('my-6 mx-16 text-[2.5vw]', isFullscreen && 'justify-center text-[3vw]')}
      />
    );
  };

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
          {videoId && <VideoBackdrop videoId={videoId} visible={overVideo} />}
          <PitchRoll className="absolute inset-x-6 top-16 z-[3]" />
          {!isFullscreen && (
            <div className="absolute bottom-4 left-4 z-12">
              <LyricsOffset value={ahead} onChange={setAhead} approximate={approximate} hasVideo={!!videoId} />
            </div>
          )}
          {currentTrack?.orderedBy && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-full bg-black/30 py-1 pr-4 pl-1 backdrop-blur">
              <img
                src={currentTrack.orderedBy.avatar}
                className="size-9 rounded-full"
                alt={currentTrack.orderedBy.name}
              />
              <span className="text-sm font-semibold text-white">{currentTrack.orderedBy.name}</span>
            </div>
          )}
          {!isFullscreen && (
            <div className="absolute right-4 bottom-4 z-10 flex gap-2">
              <SingingButtons />
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
                idle && 'pointer-events-none opacity-0',
              )}
            >
              <div className="mx-auto max-w-6xl">
                <div className="mb-3 flex items-center justify-between">
                  <LyricsOffset value={ahead} onChange={setAhead} approximate={approximate} hasVideo={!!videoId} />
                  <div className="flex gap-2">
                    <SingingButtons />
                    <IconButton
                      aria-label={t('lyrics.exitFullscreen')}
                      className="bg-black/40 text-white backdrop-blur hover:bg-black/60"
                      onClick={toggleFullscreen}
                    >
                      <Minimize className="size-6" />
                    </IconButton>
                  </div>
                </div>
                <div className="h-[84px]">
                  <AudioController />
                </div>
              </div>
            </div>
          )}
          {!overVideo && (
            <AppScrollbar
              ref={scrollbarRef}
              className={['relative z-[1] w-full h-full px-10', isFullscreen ? 'py-[25%]' : ''].join(' ')}
              style={{ color, backgroundColor: bgColor }}
            >
              {syncedLyrics.length > 0 ? (
                <>
                {gapMarker(-1)}
                {syncedLyrics.map((line, i) => (
                  <Fragment key={i}>
                  <div
                    className={['my-6 mx-16 cursor-pointer', isFullscreen ? 'text-center' : ''].join(' ')}
                    onClick={handleLineClick.bind(null, i)}
                  >
                    <span
                      className={[
                        'origin-left text-[2.5vw] leading-snug font-bold transition-all duration-300 hover:opacity-100',
                        i <= currentLine ? 'text-white' : 'opacity-70',
                        i === currentLine && !isFullscreen && 'scale-[1.04]',
                        isFullscreen ? 'text-center text-[3vw]' : '',
                        isFullscreen && (i === currentLine ? 'text-[5vw] opacity-100' : 'opacity-70'),
                      ].join(' ')}
                      ref={(el) => {
                        lineRefs.current[i] = el;
                      }}
                    >
                      {wordHighlight && i === currentLine && line.words?.length ? (
                        <WordLine words={line.words} delay={lyricsDelay} progress={progress} playing={playing} dimColor={color} />
                      ) : line.text === '' ? (
                        '♪'
                      ) : (
                        line.text
                      )}

                      {line.romanized && showTranslatinon && (
                        <>
                          <br />
                          <span className="text-[0.8em]">({line.romanized})</span>
                        </>
                      )}
                    </span>
                  </div>
                  {gapMarker(i)}
                  </Fragment>
                ))}
                </>
              ) : plain ? (
                <PlainLyrics text={plain} className="mx-16 my-10 text-[2vw]" />
              ) : (
                <div className="mt-24 text-center text-3xl font-bold" style={{ color }}>
                  {loading ? (
                    <LyricsSkeleton className="mx-auto max-w-3xl py-0" />
                  ) : (
                    <p>{currentTrack ? t('lyrics.none') : t('lyrics.start')}</p>
                  )}
                </div>
              )}
            </AppScrollbar>
          )}
        </div>
      </div>
    </>
  );
}
