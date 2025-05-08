import React, { createContext, useMemo, useState, useContext, useRef, useEffect } from 'react';
import { useAudioStore } from 'src/store/audio';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { api } from 'src/utils/api';

type PlayerContextType = {
  syncedPlayerRef: React.MutableRefObject<SyncedAudioPlayer | null>;
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
const DEFAULT_VOCALESS_VOCAL_VOLUME = 0.05; // Default volume for voiceless playback
const DEFAULT_INSTRUMENTAL_VOLUME = 0.8; // Default instrumental volume

function createPlayerContext({
  syncedPlayerRef,
}: {
  syncedPlayerRef: React.MutableRefObject<SyncedAudioPlayer | null>;
}) {
  // audio context
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_INSTRUMENTAL_VOLUME);
  const [vocalVolume, setVocalVolume] = useState(DEFAULT_VOCAL_VOLUME);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [vocalOn, setVocalOn] = useState(false);
  const [seeking, setSeeking] = useState(false);
  // lyrics context
  const [lyrics, setLyrics] = useState<Lyrics[]>([]);
  const [currentLine, setCurrentLine] = useState(-1);

  // queue context
  const lastSongId = useRef<string | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);

  const currentSong = useMemo(() => {
    return queue[queueIdx] || null;
  }, [queue, queueIdx]);

  const ctx = useMemo(
    () => ({
      syncedPlayerRef,
      loading,
      setLoading,
      playing,
      setPlaying,
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
    }),
    [
      syncedPlayerRef,
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
    ]
  );
  return ctx;
}

export const PlayerProvider = ({ children }) => {
  const syncedPlayerRef = useRef<SyncedAudioPlayer | null>(null);
  const ctx = createPlayerContext({ syncedPlayerRef });

  // 🔧 Initialize once
  useEffect(() => {
    syncedPlayerRef.current = new SyncedAudioPlayer();
  }, []);
  return (
    <PlayerContext.Provider value={ctx}>
      {/* <audio
        ref={instrumentalRef}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
        controls
        preload="auto"
        style={{ display: 'none' }}
      />
      <audio ref={vocalRef} controls preload="auto" style={{ display: 'none' }} /> */}
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  const {
    syncedPlayerRef,
    loading,
    setLoading,
    playing,
    setPlaying,
    volume,
    setVolume,
    vocalVolume,
    setVocalVolume,
    duration,
    setDuration,
    seeking,
    setSeeking,
    vocalOn,
    setVocalOn,
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
    if (!playing) return;

    const interval = setInterval(() => {
      if (!seeking && syncedPlayerRef.current && syncedPlayerRef.current.isPlaying) {
        const currentTime = syncedPlayerRef.current?.getCurrentTime();
        setProgress(currentTime);
        if (currentTime >= duration) {
          syncedPlayerRef.current?.stop();
          setProgress(0);
          next();
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [playing, duration, seeking]);

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

    console.log(currentSong.name, songStatus[currentSong.id]);
    // skip if the song is not ready and songStatus is not undefined
    if (songStatus[currentSong.id] !== undefined && songStatus[currentSong.id] !== 'ready') {
      console.log('Song is still processing, skipping initialization:', currentSong.name);
      return;
    }
    setLyrics([]);
    setCurrentLine(-1);
    setProgress(0);
    const shouldPlay = lastSongId.current === null;
    lastSongId.current = currentSong.id;
    console.log('Play new song:', currentSong.name);

    const player = syncedPlayerRef.current;
    if (!player) return;

    player.pause();
    player.seek(0);
    setLoading(true);

    Promise.all([
      player.loadAudio(
        `${api.getUri()}/songs/vocal/${currentSong.id}`,
        `${api.getUri()}/songs/instrumental/${currentSong.id}`
      ),
      fetchLyrics(currentSong.id),
    ])
      .then(() => {
        setDuration(player.getDuration());
        if (playing || shouldPlay) {
          playAudio();
        }
      })
      .catch((error) => {
        console.error('Error loading audio:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentSong?.id, songStatus[currentSong?.id || '']]);

  const playAudio = () => {
    if (!currentSong || !syncedPlayerRef.current) return;
    const player = syncedPlayerRef.current;
    player.setVolume(volume, vocalOn ? vocalVolume : DEFAULT_VOCALESS_VOCAL_VOLUME);
    player.play();
    setPlaying(true);
  };

  const pauseAudio = () => {
    syncedPlayerRef.current?.pause();
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
  const rmSongFromQueue = async (song: Song) => {
    // TODO: implement remove song from queue
    api.post('queue/remove', song).catch((error) => {
      console.error('Error removing song from queue:', error);
    });
  };

  return {
    loading,
    playing,
    duration,
    volume,
    setVolume: (value: number) => {
      const newVolume = Math.min(1, Math.max(0, value));
      syncedPlayerRef.current?.setVolume(newVolume, vocalVolume);
    },
    seeking,
    setSeeking,
    progress,
    setProgress,
    vocalOn,
    play: playAudio,
    pause: pauseAudio,
    toggleVocal: () => {
      if (!syncedPlayerRef.current) return;
      const newVolume = vocalOn ? DEFAULT_VOCALESS_VOCAL_VOLUME : DEFAULT_VOCAL_VOLUME;
      setVocalVolume(newVolume);
      syncedPlayerRef.current.setVolume(volume, newVolume);
      setVocalOn((prev) => !prev);
    },
    increaseVolume: () => {
      const newVolume = Math.min(1, volume + 0.1);
      syncedPlayerRef.current?.setVolume(newVolume, vocalVolume);
      setVolume(newVolume);
    },
    decreaseVolume: () => {
      const newVolume = Math.max(0, volume - 0.1);
      syncedPlayerRef.current?.setVolume(newVolume, vocalVolume);
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
    rmFromQueue: (song: Song) => {
      setQueue((prevQueue) => prevQueue.filter((s) => s.id !== song.id));
    },
    resetProgress: (time: number) => {
      syncedPlayerRef.current?.seek(time);
      setProgress(time);
    },
    seek: (time: number) => {
      syncedPlayerRef.current?.seek(time);
      setProgress(time);
    },
    addSongToQueue,
    rmSongFromQueue,
    fetchDefaultTracks,
  };
};
