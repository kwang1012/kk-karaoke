import { useEffect, useRef } from 'react';
import AppScrollbar from 'src/components/Scrollbar';
import { useAudio } from 'src/hooks/audio';
import { useAudioStore, useCurrentSong } from 'src/store';

export default function LyricsView() {
  // audio references
  const { instrumentalRef, vocalRef } = useAudio();
  // local states
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // shared states
  const currentTime = useAudioStore((state) => state.currentTime);
  const currentLine = useAudioStore((state) => state.currentLine);
  const currentSong = useCurrentSong();
  const lyrics = useAudioStore((state) => state.lyrics);
  const setCurrentLine = useAudioStore((state) => state.setCurrentLine);

  // const { queue, addSong, connected } = useWebSocketQueue('ws://127.0.0.1:8000/ws');

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
    const index = lyrics.findIndex((line, i) => {
      return currentTime >= line.time && (i === lyrics.length - 1 || currentTime < lyrics[i + 1].time);
    });
    if (index !== -1 && index !== currentLine) {
      setCurrentLine(index);
    }
  }, [currentTime]);

  const handleLineClick = async (index: number) => {
    const seekTime = lyrics[index].time;

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
          {lyrics.length > 0 ? (
            lyrics.map((line, i) => (
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
