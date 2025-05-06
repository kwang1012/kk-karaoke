import React, { createContext, useMemo, useState, useContext, useRef, useEffect } from 'react';
// @ts-ignore
import { useAudioStore } from 'src/store/audio';
import { api } from 'src/utils/api';

type PlayerContextType = {
  instrumentalRef: React.RefObject<HTMLAudioElement>;
  vocalRef: React.RefObject<HTMLAudioElement>;
  // song context
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  volume: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  progress: number;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  duration: number;
  setDuration: React.Dispatch<React.SetStateAction<number>>;
  seeking: boolean;
  setSeeking: React.Dispatch<React.SetStateAction<boolean>>;
  vocalOn: boolean;
  setVocalOn: React.Dispatch<React.SetStateAction<boolean>>;
  vocalVolume: number;
  setVocalVolume: React.Dispatch<React.SetStateAction<number>>;
  // lyrics context
  lyrics: Lyrics[];
  setLyrics: React.Dispatch<React.SetStateAction<Lyrics[]>>;
  currentLine: number;
  setCurrentLine: React.Dispatch<React.SetStateAction<number>>;
  // queue context
  queue: Song[];
  setQueue: React.Dispatch<React.SetStateAction<Song[]>>;
  queueIdx: number;
  setQueueIdx: React.Dispatch<React.SetStateAction<number>>;
  currentSong: Song | null;
  lastSongId: React.MutableRefObject<string | null>;
};

export const PlayerContext = createContext<PlayerContextType | null>(null);

const DEFAULT_VOCAL_VOLUME = 0.6; // Default vocal volume
const DEFAULT_VOCALESS_VOCAL_VOLUME = 0.1; // Default volume for voiceless playback
const DEFAULT_INSTRUMENTAL_VOLUME = 0.8; // Default instrumental volume

function createPlayerContext({
  instrumentalRef,
  vocalRef,
}: {
  instrumentalRef: React.RefObject<HTMLAudioElement>;
  vocalRef: React.RefObject<HTMLAudioElement>;
}) {
  // pure audio context
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [semitone, setSemitone] = useState(0);
  const [volume, setVolume] = useState(DEFAULT_INSTRUMENTAL_VOLUME);
  const [vocalVolume, setVocalVolume] = useState(DEFAULT_VOCAL_VOLUME);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [vocalOn, setVocalOn] = useState(false);
  const [seeking, setSeeking] = useState(false);
  // lyrics context
  const [lyrics, setLyrics] = useState<Lyrics[]>([]);
  const [currentLine, setCurrentLine] = useState(-1);
  // shared states

  // queue context
  const lastSongId = useRef<string | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);

  const currentSong = useMemo(() => {
    return queue[queueIdx] || null;
  }, [queue, queueIdx]);

  const onTimeUpdate = () => {
    if (instrumentalRef.current) {
      if (!seeking) {
        setProgress(instrumentalRef.current.currentTime);
      }
    }
  };
  const onEnded = () => {
    if (queueIdx >= queue.length - 1) {
      console.log('No next song in the queue');
    }
    setQueueIdx(queueIdx + 1);
  };
  const onLoadedMetadata = () => setDuration(instrumentalRef.current?.duration || 0);

  const ctx = useMemo(
    () => ({
      instrumentalRef,
      vocalRef,
      loading,
      setLoading,
      playing,
      setPlaying,
      tempo,
      setTempo,
      pitch,
      setPitch,
      semitone,
      setSemitone,
      volume,
      setVolume,
      progress,
      setProgress,
      duration,
      setDuration,
      seeking,
      setSeeking,
      vocalOn,
      setVocalOn,
      vocalVolume,
      setVocalVolume,
      lyrics,
      setLyrics,
      currentLine,
      setCurrentLine,
      queue,
      setQueue,
      queueIdx,
      setQueueIdx,
      currentSong,
      lastSongId,
      onTimeUpdate,
      onEnded,
      onLoadedMetadata,
    }),
    [
      instrumentalRef,
      vocalRef,
      loading,
      setLoading,
      playing,
      setPlaying,
      tempo,
      setTempo,
      pitch,
      setPitch,
      semitone,
      setSemitone,
      volume,
      setVolume,
      duration,
      setDuration,
      seeking,
      setSeeking,
      vocalOn,
      setVocalOn,
      vocalVolume,
      setVocalVolume,
      progress,
      setProgress,
      lyrics,
      setLyrics,
      currentLine,
      setCurrentLine,
      queue,
      setQueue,
      queueIdx,
      setQueueIdx,
      currentSong,
      lastSongId,
      onTimeUpdate,
      onEnded,
      onLoadedMetadata,
    ]
  );
  return ctx;
}

export const PlayerProvider = ({ children }) => {
  const instrumentalRef = useRef<HTMLAudioElement>(null);
  const vocalRef = useRef<HTMLAudioElement>(null);
  const ctx = createPlayerContext({ instrumentalRef, vocalRef });
  const { onTimeUpdate, onEnded, onLoadedMetadata } = ctx;
  return (
    <PlayerContext.Provider value={ctx}>
      <audio
        ref={instrumentalRef}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
        controls
        preload="auto"
        style={{ display: 'none' }}
      />
      <audio ref={vocalRef} controls preload="auto" style={{ display: 'none' }} />
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  const {
    instrumentalRef,
    vocalRef,
    loading,
    setLoading,
    playing,
    setPlaying,
    volume,
    setVolume,
    duration,
    setDuration,
    seeking,
    setSeeking,
    vocalOn,
    setVocalOn,
    vocalVolume,
    progress,
    setProgress,
    lyrics,
    setLyrics,
    currentLine,
    setCurrentLine,
    queue,
    setQueue,
    queueIdx,
    setQueueIdx,
    currentSong,
    lastSongId,
  } = ctx;

  const songStatus = useAudioStore((state) => state.songStatus);
  const setSongStatus = useAudioStore((state) => state.setSongStatus);

  const next = () => {
    if (queueIdx >= queue.length - 1) {
      console.log('No next song in the queue');
    }
    setQueueIdx(queueIdx + 1);
  };

  const previous = () => {
    if (queueIdx <= 0) {
      console.log('No previous song in the queue');
    }
    setQueueIdx(queueIdx - 1);
  };

  // load song/lyrics when currentSong changes
  const fetchLyrics = async (songId: string) => {
    api
      .get(`lyrics/${songId}`)
      .then(({ data }) => {
        setLyrics(data.lyrics);
      })
      .catch((error) => {
        console.error('Error fetching lyrics:', error);
      });
  };

  useEffect(() => {
    // no next song
    if (!currentSong) {
      setLyrics([]);
      setCurrentLine(-1);
      setProgress(0);
      lastSongId.current = null;
    }

    // prevent re-initialization on every render
    if (!currentSong || currentSong.id === lastSongId.current) return;

    // skip if the song is not ready and songStatus is not undefined
    if (songStatus[currentSong.id] !== undefined && songStatus[currentSong.id] !== 'ready') {
      console.log('Song is still processing, skipping initialization:', currentSong.name);
      return;
    }
    setLyrics([]);
    setCurrentLine(-1);
    setProgress(0);
    lastSongId.current = currentSong.id;
    console.log('Play new song:', currentSong.name);

    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    instrumental.src = `${api.getUri()}/songs/instrumental/${currentSong.id}`;
    vocal.src = `${api.getUri()}/songs/vocal/${currentSong.id}`;
    instrumental.load();
    vocal.load();
    instrumental.currentTime = vocal.currentTime = 0;
    setDuration(instrumental.duration || 0);

    fetchLyrics(currentSong.id).then(() => {
      if (playing) {
        playAudio();
      }
    });
  }, [currentSong?.id, songStatus[currentSong?.id || '']]);

  const playAudio = () => {
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    vocal.volume = vocalOn ? vocalVolume : DEFAULT_VOCALESS_VOCAL_VOLUME;
    Promise.all([instrumental.play(), vocal.play()])
      .then(() => {
        vocal.currentTime = instrumental.currentTime;
        setPlaying(true);
      })
      .catch((err) => console.error('Playback error:', err));
  };

  const pauseAudio = () => {
    const instrumental = instrumentalRef.current;
    const vocal = vocalRef.current;
    if (!instrumental || !vocal) return;

    instrumental.pause();
    vocal.pause();
    setPlaying(false);
  };

  const fetchDefaultTracks = async () => {
    api
      .get('tracks')
      .then(({ data }) => {
        setQueue((prevQueue) => [...prevQueue, ...data.tracks]);
      })
      .catch((error) => {
        console.error('Error fetching default tracks:', error);
      });
  };
  const addSongToQueue = async (song: Song) => {
    api
      .post('queue/add', song)
      .then(({ data }) => {
        if (data.is_ready) {
          setSongStatus(song.id, 'ready');
        } else {
          setSongStatus(song.id, 'submitted');
        }
      })
      .catch((error) => {
        console.error('Error adding song to queue:', error);
      });
  };

  return {
    instrumentalRef,
    vocalRef,
    loading,
    playing,
    duration,
    volume,
    seeking,
    setSeeking,
    progress,
    setProgress,
    vocalOn,
    play: playAudio,
    pause: pauseAudio,
    toggleVocal: () => {
      if (vocalRef.current) {
        vocalRef.current.volume = !vocalOn ? vocalVolume : DEFAULT_VOCALESS_VOCAL_VOLUME;
      }
      setVocalOn((prev) => !prev);
    },
    increaseVolume: () => {
      if (!instrumentalRef.current) return;
      const newVolume = Math.min(1, volume + 0.1);
      instrumentalRef.current.volume = newVolume;
      setVolume(newVolume);
    },
    decreaseVolume: () => {
      if (!instrumentalRef.current) return;
      const newVolume = Math.max(0, volume - 0.1);
      instrumentalRef.current.volume = newVolume;
      setVolume(newVolume);
    },
    lyrics,
    currentLine,
    setCurrentLine,
    currentSong,
    next,
    previous,
    queue,
    queueIdx,
    addToQueue: (song: Song) => {
      setQueue((prevQueue) => [...prevQueue, song]);
    },
    addSongToQueue,
    fetchDefaultTracks,
  };
};
