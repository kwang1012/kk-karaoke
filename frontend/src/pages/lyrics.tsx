import { useEffect, useMemo, useRef } from 'react';
import AppScrollbar from 'src/components/Scrollbar';
import { usePlayer } from 'src/hooks/player';
import { useAudioStore } from 'src/store';

export default function LyricsView() {
  // local states
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { instrumentalRef, vocalRef, progress, currentLine, setCurrentLine, currentSong, lyrics, seeking } =
    usePlayer();
  const lyricsDelay = useAudioStore((state) => state.lyricsDelays[currentSong?.id || ''] || 0);
  const syncedLyrics = useMemo(() => {
    return lyrics.map((line) => {
      return {
        ...line,
        time: line.time + lyricsDelay,
      };
    });
  }, [lyrics, lyricsDelay])

  useEffect(() => {
    lineRefs.current = Array(lyrics.length).fill(null);
  }, [lyrics]);

  useEffect(() => {
    const el = lineRefs.current[currentLine];
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center', // scroll to center of container
      });
    }
  }, [currentLine]);

  useEffect(() => {
    if (!currentSong) return;
    document.title = `${currentSong.name}．${currentSong.artists.join(',')}`;
  }, [currentSong]);

  useEffect(() => {
    const index = syncedLyrics.findIndex((line, i) => {
      return (
        progress >= line.time && (i === syncedLyrics.length - 1 || progress < syncedLyrics[i + 1].time)
      );
    });
    if (index !== -1 && index !== currentLine && !seeking) {
      setCurrentLine(index);
    }
  }, [progress]);

  const handleLineClick = async (index: number) => {
    const seekTime = syncedLyrics[index].time + lyricsDelay;

    // Always set the time before calling play()
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;
    instrumental.currentTime = vocal.currentTime = seekTime;
  };

  return (
    <div className="h-full">
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
              <p>{currentSong ? 'No lyrics available for this song.' : 'Start playing a song!'}</p>
            </div>
          )}
        </div>
      </AppScrollbar>
    </div>
  );
}
