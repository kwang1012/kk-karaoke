import { createContext, useRef, useContext } from 'react';
import { useAudioStore } from 'src/store';

type AudioContextType = {
  instrumentalRef: React.RefObject<HTMLAudioElement>;
  vocalRef: React.RefObject<HTMLAudioElement>;
  // Add other methods and properties as needed
};
const AudioContext = createContext<null | AudioContextType>(null);

function createAudioContext() {
  const instrumentalRef = useRef<HTMLAudioElement>(null);
  const vocalRef = useRef<HTMLAudioElement>(null);

  return {
    instrumentalRef,
    vocalRef,
    // etc.
  };
}

export const AudioProvider = ({ children }: { children: React.ReactNode }) => {
  const ctx = createAudioContext();
  const { instrumentalRef, vocalRef } = ctx;
  const setCurrentTime = useAudioStore((state) => state.setCurrentTime);
  const isSeeking = useAudioStore((state) => state.isSeeking);
  const next = useAudioStore((state) => state.next);
  const setDuration = useAudioStore((state) => state.setDuration);
  return (
    <AudioContext.Provider value={ctx}>
      <audio
        ref={instrumentalRef}
        controls
        onTimeUpdate={() => {
          if (instrumentalRef.current) {
            if (!isSeeking) {
              setCurrentTime(instrumentalRef.current.currentTime);
            }
          }
        }}
        onEnded={next}
        onLoadedMetadata={() => setDuration(instrumentalRef.current?.duration || 0)}
        preload="auto"
        style={{ display: 'none' }}
      />
      <audio ref={vocalRef} controls preload="auto" style={{ display: 'none' }} />
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
};
