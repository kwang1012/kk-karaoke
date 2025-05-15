import { useEffect, useMemo, useRef, useState } from 'react';
import AppScrollbar from 'src/components/Scrollbar';
import { usePlayer } from 'src/store/player';
import { useTrackStore } from 'src/store';
import { DEFAULT_BG_COLOR, DEFAULT_COLOR, getLyricsRGB } from 'src/utils';
import { IconButton, Tooltip, useTheme } from '@mui/material';
import { FullscreenExitOutlined, FullscreenOutlined } from '@mui/icons-material';
import { useSettingStore } from 'src/store/setting';

export default function LyricsView() {
  // local states
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const { progress, currentLine, setCurrentLine, currentSong, lyrics, seeking, loading } = usePlayer();
  const { seek } = usePlayer();
  const lyricsDelay = useTrackStore((state) => state.lyricsDelays[currentSong?.id || ''] || 0);
  const syncedLyrics = useMemo(() => {
    return lyrics.map((line) => {
      return {
        ...line,
        time: line.time + lyricsDelay,
      };
    });
  }, [lyrics, lyricsDelay]);

  useEffect(() => {
    lineRefs.current = Array(lyrics.length).fill(null);
  }, [lyrics]);

  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG_COLOR);
  const image = currentSong?.album?.images?.[0]?.url;
  const theme = useTheme();
  useEffect(() => {
    if (!image) {
      setColor(DEFAULT_COLOR);
      setBgColor(DEFAULT_BG_COLOR);
      return;
    }
    getLyricsRGB(image, theme.palette.mode === 'light')
      .then(({ lyrics, background }) => {
        setColor(lyrics);
        setBgColor(background);
      })
      .catch((error) => {
        console.error('Error fetching average RGB:', error);
      });
  }, [image, theme.palette.mode]);

  useEffect(() => {
    const el = lineRefs.current[currentLine];
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center', // scroll to center of container
      });
    }
  }, [currentLine, lineRefs.current]);

  useEffect(() => {
    if (!currentSong) return;
    document.title = `${currentSong.name}．${currentSong.artists.map((artist) => artist.name).join('、')} - Lyrics`;
  }, [currentSong]);

  useEffect(() => {
    const index = syncedLyrics.findIndex((line, i) => {
      return progress >= line.time && (i === syncedLyrics.length - 1 || progress < syncedLyrics[i + 1].time);
    });
    if (index !== -1 && index !== currentLine && !seeking) {
      setCurrentLine(index);
    }
  }, [progress]);

  const handleLineClick = async (index: number) => {
    const seekTime = syncedLyrics[index].time + lyricsDelay;
    seek(seekTime);
  };
  const isFullscreen = useSettingStore((state) => state.isFullScreen);
  const setIsFullscreen = useSettingStore((state) => state.setFullScreen);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (containerRef.current) {
      if (isFullscreen) {
        document.exitFullscreen();
      } else {
        const el = containerRef.current;
        // const el = document.documentElement;

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
    <div className="relative w-full h-full" ref={containerRef}>
      {currentSong?.orderedBy && (
        <div className="absolute top-2 right-3 z-10 flex items-center cursor-pointer px-2 bg-black/30 rounded-md">
          <img src={currentSong.orderedBy.avatar} className="w-12 h-12" alt={currentSong.orderedBy.name} />
          <span className="font-bold pr-2">{currentSong.orderedBy.name}</span>
        </div>
      )}
      <div className="absolute bottom-2 right-3 z-10">
        <IconButton
          disableRipple
          className="opacity-70 hover:opacity-90 active:opacity-100 active:scale-110"
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
        </IconButton>
      </div>
      <AppScrollbar className="w-full h-full" style={{ color, backgroundColor: bgColor }}>
        <>
          {syncedLyrics.length > 0 ? (
            syncedLyrics.map((line, i) => (
              <div key={i} className={['m-8', isFullscreen ? 'text-center' : ''].join(' ')}>
                <span
                  className={[
                    'text-3xl cursor-pointer font-bold hover:underline hover:opacity-100',
                    i <= currentLine ? 'text-white' : '',
                    isFullscreen ? 'text-6xl leading-loose text-center' : '',
                  ].join(' ')}
                  ref={(el) => (lineRefs.current[i] = el)}
                  onClick={handleLineClick.bind(null, i)}
                >
                  {line.text}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center mt-20 text-4xl font-bold" style={{ color }}>
              {!loading && <p>{currentSong ? 'No lyrics available for this track.' : 'Start playing a track!'}</p>}
            </div>
          )}
        </>
      </AppScrollbar>
    </div>
  );
}
