import { useEffect, useMemo, useRef, useState } from 'react';
import AppScrollbar from 'src/components/Scrollbar';
import { usePlayer } from 'src/hooks/player';
import { useAudioStore } from 'src/store';
import { getAvgRGB, getBrightestRGB } from 'src/utils';

export default function LyricsView() {
  // local states
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { progress, currentLine, setCurrentLine, currentSong, lyrics, seeking } = usePlayer();
  const { seek } = usePlayer();
  const lyricsDelay = useAudioStore((state) => state.lyricsDelays[currentSong?.id || ''] || 0);
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

  const [color, setColor] = useState<string>('#535353');
  const image = currentSong?.album?.images?.[0]?.url;
  useEffect(() => {
    if (!image) {
      setColor('#535353');
      return;
    }
    getBrightestRGB(image)
      .then((data) => {
        setColor(data);
      })
      .catch((error) => {
        console.error('Error fetching average RGB:', error);
      });
  }, [image]);

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
    document.title = `${currentSong.name}．${currentSong.artists.join(',')}`;
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
    <div
      className="h-full"
      style={{
        backgroundColor: color,
      }}
    >
      <AppScrollbar>
        <div className="text-lg px-8 text-white">
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
                    (i <= currentLine ? 'opacity-100' : 'opacity-50')
                  }
                >
                  {line.text}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 mt-20 text-4xl">
              <p>{currentSong ? 'No lyrics available for this track.' : 'Start playing a track!'}</p>
            </div>
          )}
        </div>
      </AppScrollbar>
    </div>
  );
}
