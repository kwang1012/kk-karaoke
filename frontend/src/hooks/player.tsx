import { useQuery } from '@tanstack/react-query';
import React, { createContext, useMemo, useState, useContext, useRef, useEffect } from 'react';
import { emptyQueue, fetchLyrics, fetchQueue, fetchRandomTracks, pushToQueue, removeFromQueue } from 'src/apis/player';
import { Lyrics, Track } from 'src/models/spotify';
import ShiftedAutioPlayer from 'src/shiftedPlayer';
import { useAudioStore } from 'src/store/audio';
import { useRoomStore } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { api } from 'src/utils/api';

type PlayerContextType = {
  syncedPlayerRef: React.MutableRefObject<SyncedAudioPlayer | null>;
  // track context
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  semitone: number;
  setSemitone: React.Dispatch<React.SetStateAction<number>>;
  volume: number;
  setVolume: (value: number) => void;
  progress: number;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  duration: number;
  setDuration: React.Dispatch<React.SetStateAction<number>>;
  seeking: boolean;
  setSeeking: React.Dispatch<React.SetStateAction<boolean>>;
  vocalOn: boolean;
  setVocalOn: (value: boolean) => void;
  vocalVolume: number;
  setVocalVolume: React.Dispatch<React.SetStateAction<number>>;
  // lyrics context
  lyrics: Lyrics[];
  setLyrics: React.Dispatch<React.SetStateAction<Lyrics[]>>;
  currentLine: number;
  setCurrentLine: React.Dispatch<React.SetStateAction<number>>;
  // queue context
  queue: Track[];
  setQueue: React.Dispatch<React.SetStateAction<Track[]>>;
  queueIdx: number;
  setQueueIdx: React.Dispatch<React.SetStateAction<number>>;
  currentSong: Track | null;
  lastSongId: React.MutableRefObject<string | null>;
};

export const PlayerContext = createContext<PlayerContextType | null>(null);

const DEFAULT_VOCAL_VOLUME = 0.6; // Default vocal volume
const DEFAULT_VOCALESS_VOCAL_VOLUME = 0; // Default volume for voiceless playback
// const DEFAULT_INSTRUMENTAL_VOLUME = 0.8; // Default instrumental volume

function createPlayerContext({
  syncedPlayerRef,
}: {
  syncedPlayerRef: React.MutableRefObject<SyncedAudioPlayer | null>;
}) {
  // audio context
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [semitone, setSemitone] = useState(0);
  // const [volume, setVolume] = useState(DEFAULT_INSTRUMENTAL_VOLUME);
  const [vocalVolume, setVocalVolume] = useState(DEFAULT_VOCAL_VOLUME);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  // const [vocalOn, setVocalOn] = useState(false);
  const [seeking, setSeeking] = useState(false);
  // persistent settings
  const setVolume = useSettingStore((state) => state.setVolume);
  const volume = useSettingStore((state) => state.volume);
  const vocalOn = useSettingStore((state) => state.vocalOn);
  const setVocalOn = useSettingStore((state) => state.setVocalOn);
  // lyrics context
  const [lyrics, setLyrics] = useState<Lyrics[]>([]);
  const [currentLine, setCurrentLine] = useState(-1);

  // queue context
  const lastSongId = useRef<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
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
    }),
    [
      syncedPlayerRef,
      loading,
      setLoading,
      playing,
      setPlaying,
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
    ]
  );
  return ctx;
}

export const PlayerProvider = ({ children }) => {
  // the states that should be initialized only once go here
  const syncedPlayerRef = useRef<SyncedAudioPlayer | null>(null);

  // 🔧 Initialize player based on setting
  // We put it here because everytime we change the setting we reload the window
  const enabledPitchShift = useSettingStore((state) => state.enabledPitchShift);
  useEffect(() => {
    // console.log('Initializing player. Pitch shift enabled:', enabledPitchShift);
    if (enabledPitchShift) syncedPlayerRef.current = new ShiftedAutioPlayer();
    else syncedPlayerRef.current = new SyncedAudioPlayer();
  }, []);

  const ctx = createPlayerContext({ syncedPlayerRef });
  return <PlayerContext.Provider value={ctx}>{children}</PlayerContext.Provider>;
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
    semitone,
    setSemitone,
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

  // =============== hooks from other stores ===============
  const songStatus = useAudioStore((state) => state.songStatus);
  const setSongStatus = useAudioStore((state) => state.setSongStatus);
  const removeSongStatus = useAudioStore((state) => state.removeSongStatus);
  const removeSongProgress = useAudioStore((state) => state.removeSongProgress);
  const roomId = useRoomStore((state) => state.roomId);

  // =============== useEffect ===============

  const { data: fetchedQueue } = useQuery({
    queryKey: ['queue', roomId],
    queryFn: () => fetchQueue(roomId),
  });
  // 🔧 Initialize once
  useEffect(() => {
    // fetching queue
    if (fetchedQueue) {
      setQueue(fetchedQueue.tracks);
    }
  }, [fetchedQueue]);

  // update progress every 50ms
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
    }, 100);

    return () => clearInterval(interval);
  }, [playing, duration, seeking]);

  // detect current track change
  useEffect(() => {
    // no next track
    if (!currentSong) {
      setLyrics([]);
      setCurrentLine(-1);
      setProgress(0);
      lastSongId.current = null;
      return;
    }

    // prevent re-initialization on every render
    if (currentSong.id === lastSongId.current) return;

    // skip if the track is not ready and songStatus is not undefined
    if (songStatus[currentSong.id] !== undefined && songStatus[currentSong.id] !== 'ready') {
      console.log('Track is still processing, skipping initialization:', currentSong.name);
      return;
    }

    // const shouldPlay = lastSongId.current === null;
    lastSongId.current = currentSong.id;

    const player = syncedPlayerRef.current;
    if (!player) return;

    console.log('Play new track:', currentSong.name);

    // reset state related to the previous track
    setLyrics([]);
    setCurrentLine(-1);
    setProgress(0);
    // player.pause();
    // player.seek(0);
    if (player instanceof ShiftedAutioPlayer) {
      player.setSemitone(0);
      setSemitone(0);
    }

    setLoading(true);

    Promise.all([
      player.loadAudio(
        `${api.getUri()}/songs/vocal/${currentSong.id}`,
        `${api.getUri()}/songs/instrumental/${currentSong.id}`
      ),
      fetchLyrics(currentSong.id),
    ])
      .then(([_, lyrics]) => {
        setLyrics(lyrics);
        setDuration(player.getDuration());
        if (playing) {
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

  // =============== functions that affect states ===============
  const next = () => {
    if (queueIdx >= queue.length - 1) {
      console.log('No next track in the queue');
      return;
    }
    setQueueIdx(queueIdx + 1);
  };

  const previous = () => {
    if (queueIdx <= 0) {
      console.log('No previous track in the queue');
      return;
    }
    setQueueIdx(queueIdx - 1);
  };

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

  const getRandomTracks = async () => {
    fetchRandomTracks().then((tracks) => {
      setQueue((prevQueue) => [...prevQueue, ...tracks]);
    });
  };
  const addSongToQueue = async (track: Track) => {
    setSongStatus(track.id, 'submitted');
    pushToQueue(roomId, track).then((data) => {
      if (data.isReady) {
        setSongStatus(track.id, 'ready');
      }
    });
  };
  const rmSongFromQueue = async (track: Track, idx: number) => {
    removeFromQueue(roomId, track).then(() => {
      // removeSongStatus(track.id);
      // removeSongProgress(track.id);
      setQueue((prevQueue) => prevQueue.filter((_, i) => i !== idx));
    });
  };
  const clearQueue = async () => {
    emptyQueue(roomId).then(() => {
      setQueue([]);
      setQueueIdx(0);
    });
  };

  return {
    loading,
    playing,
    duration,
    semitone,
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
      setVocalOn(!vocalOn);
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
    increaseSemitone: () => {
      if (!syncedPlayerRef.current) return;
      const newSemitone = Math.min(12, semitone + 1);
      syncedPlayerRef.current.setSemitone(newSemitone);
      setSemitone(newSemitone);
    },
    decreaseSemitone: () => {
      if (!syncedPlayerRef.current) return;
      const newSemitone = Math.max(-12, semitone - 1);
      syncedPlayerRef.current.setSemitone(newSemitone);
      setSemitone(newSemitone);
    },
    lyrics,
    currentLine,
    setCurrentLine,
    currentSong,
    next,
    previous,
    queue,
    setQueue,
    queueIdx,
    addToQueue: (track: Track) => {
      setQueue((prevQueue) => [...prevQueue, track]);
    },
    rmFromQueue: (track: Track) => {
      setQueue((prevQueue) => prevQueue.filter((s) => s.id !== track.id));
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
    getRandomTracks,
    clearQueue,
  };
};
