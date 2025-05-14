import { useEffect, useMemo, useRef, useState } from 'react';
import AppScrollbar from 'src/components/Scrollbar';
import { usePlayer } from 'src/store/player';
import { useTrackStore } from 'src/store';
import { DEFAULT_BG_COLOR, DEFAULT_COLOR, getLyricsRGB } from 'src/utils';
import { useTheme } from '@mui/material';

export default function LyricsView() {
  // local states
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  return (
    <AppScrollbar className="h-full" style={{ backgroundColor: bgColor }}>
      <div className="text-lg px-8" style={{ color: color }}>
        {syncedLyrics.length > 0 ? (
          syncedLyrics.map((line, i) => (
            <div
              key={i}
              className="my-8"
              ref={(el) => (lineRefs.current[i] = el)}
              onClick={handleLineClick.bind(null, i)}
            >
              <span
                className={
                  'text-3xl cursor-pointer font-bold hover:underline hover:opacity-100 ' +
                  (i <= currentLine ? 'text-white' : '')
                }
              >
                {line.text}
              </span>
            </div>
          ))
        ) : (
          <div className="text-center mt-20 text-4xl font-bold" style={{ color: color }}>
            {!loading && <p>{currentSong ? 'No lyrics available for this track.' : 'Start playing a track!'}</p>}
          </div>
        )}
      </div>
    </AppScrollbar>
  );
}
