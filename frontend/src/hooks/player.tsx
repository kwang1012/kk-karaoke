import { useQuery } from '@tanstack/react-query';
import React, { createContext, useMemo, useState, useContext, useRef, useEffect, act } from 'react';
import {
  emptyQueue,
  fetchLyrics,
  fetchQueue,
  fetchRandomTracks,
  pushToQueue,
  removeFromQueue,
  updateQueueIdx,
} from 'src/apis/player';
import { Lyrics, Track } from 'src/models/spotify';
import ShiftedAutioPlayer from 'src/shiftedPlayer';
import { useAudioStore } from 'src/store/audio';
import { useJam, useRoomStore } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
import { useWebSocketStore } from 'src/store/ws';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { api } from 'src/utils/api';
import { useRemoteMessageQueue } from './queue';

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
  playAudio: () => void;
  pauseAudio: () => void;
  next: () => void;
  previous: () => void;
  getRandomTracks: () => Promise<void>;
  addSongToQueue: (track: Track) => Promise<void>;
  rmSongFromQueue: (track: Track, idx: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  // jam
  isInJam: boolean;
  isOwner: boolean;
  shouldBroadcast: boolean;
  activeRoomId: string;
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
  const [queueIdx, setQueueIdx] = useState(-1);

  const currentSong = useMemo(() => {
    return queue[queueIdx] || null;
  }, [queue, queueIdx]);

  const songStatus = useAudioStore((state) => state.songStatus);
  const setSongStatus = useAudioStore((state) => state.setSongStatus);
  const removeSongStatus = useAudioStore((state) => state.removeSongStatus);
  const removeSongProgress = useAudioStore((state) => state.removeSongProgress);
  const roomId = useRoomStore((state) => state.roomId);
  const joinedRoomId = useRoomStore((state) => state.joinedRoom);
  const activeRoomId = useMemo(() => joinedRoomId || roomId, [joinedRoomId, roomId]);
  const sendMessage = useWebSocketStore((state) => state.sendMessage);

  const { isInJam, isOwner, shouldBroadcast } = useJam();

  useRemoteMessageQueue('jam', {
    onAddItem: (message) => {
      if (message.type !== 'jam') return;
      const data = message.data;
      const rid = message.roomId;
      const action = message.action;
      const op = message.op;
      if (rid !== activeRoomId) return; // ignore message if not in the same room
      if (action == 'update' && rid === roomId) return; // ignore message if owner and action is update
      if (action == 'update') {
        const currentTime = data.currentTime;
        if (!currentTime) return;
        // we dont update the player ref because it won't be played on device
        setProgress(currentTime);
      }
      console.log('Received message:', message);
      if (action == 'control') {
        console.log('Operation:', op, 'data:', data);
        switch (op) {
          case 'play':
            if (isOwner) playAudio();
            else setPlaying(true);
            break;
          case 'pause':
            if (syncedPlayerRef.current && isOwner) pauseAudio();
            else setPlaying(false);
            break;
          case 'next':
            if (isOwner) next();
            else setQueueIdx((prev) => prev + 1);
            break;
          case 'previous':
            if (isOwner) previous();
            else setQueueIdx((prev) => prev - 1);
            break;
          case 'seek':
            if (isOwner) {
              const seekTime = data.seekTime;
              if (seekTime) {
                syncedPlayerRef.current?.seek(seekTime);
                setProgress(seekTime);
              }
            }
            break;
          case 'setVolume':
            if (isOwner) {
              if (data.volume) {
                setVolume(data.volume);
                const newVolume = Math.min(1, Math.max(0, data.volume));
                syncedPlayerRef.current?.setVolume(newVolume, vocalVolume);
              }
            }
            break;
        }
      }
    },
  });

  const {
    data: { index, tracks },
  } = useQuery({
    queryKey: ['queue', activeRoomId],
    queryFn: () => fetchQueue(activeRoomId),
    refetchOnWindowFocus: false,
    initialData: {
      index: -1,
      tracks: [],
    },
  });
  // 🔧 Initialize once
  useEffect(() => {
    // fetching queue
    if (tracks) {
      setQueue(tracks);
    }
    if (index !== -1 && index !== queueIdx) {
      setQueueIdx(index);
    }
  }, [index, tracks]);

  // =============== useEffect ===============

  // update progress every 50ms
  useEffect(() => {
    if (!playing) return;

    const interval = setInterval(() => {
      if (!seeking && syncedPlayerRef.current && syncedPlayerRef.current.isPlaying) {
        const currentTime = syncedPlayerRef.current?.getCurrentTime();
        setProgress(currentTime);
        // owner, and someone in jam
        if (isOwner) {
          sendMessage({
            type: 'jam',
            action: 'update',
            roomId: activeRoomId,
            data: {
              currentTime,
            },
          });
        }
        if (currentTime >= duration) {
          syncedPlayerRef.current?.stop();
          setProgress(0);
          next();
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [playing, duration, seeking]);

  // detect current track change
  useEffect(() => {
    if (isInJam) return;
    // no next track
    if (!currentSong) {
      setLyrics([]);
      setCurrentLine(-1);
      setProgress(0);
      setDuration(0);
      setPlaying(false);
      syncedPlayerRef.current?.stop();
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

  const playAudio = () => {
    if (loading) return;
    if (!currentSong || !syncedPlayerRef.current) return;
    const player = syncedPlayerRef.current;
    player.setVolume(volume, vocalOn ? vocalVolume : DEFAULT_VOCALESS_VOCAL_VOLUME);
    player.play();
    setPlaying(true);
  };

  // =============== functions that affect states ===============
  const next = () => {
    if (queueIdx >= queue.length) {
      console.log('No next track in the queue');
      return;
    }
    updateQueueIdx(activeRoomId, queueIdx + 1);
    setQueueIdx(queueIdx + 1);
  };

  const previous = () => {
    if (queueIdx <= 0) {
      console.log('No previous track in the queue');
      return;
    }
    updateQueueIdx(activeRoomId, queueIdx - 1);
    setQueueIdx(queueIdx - 1);
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
    pushToQueue(activeRoomId, track).then((data) => {
      if (data.isReady) {
        setSongStatus(track.id, 'ready');
      }
    });
  };
  const rmSongFromQueue = async (track: Track, idx: number) => {
    removeFromQueue(activeRoomId, track).then(() => {
      // removeSongStatus(track.id);
      // removeSongProgress(track.id);
      setQueue((prevQueue) => prevQueue.filter((_, i) => i !== idx));
    });
  };
  const clearQueue = async () => {
    emptyQueue(activeRoomId).then(() => {
      setQueue((prev) => prev.slice(0, queueIdx + 1));
    });
  };

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
      playAudio,
      pauseAudio,
      next,
      previous,
      getRandomTracks,
      addSongToQueue,
      rmSongFromQueue,
      clearQueue,
      setSongStatus,
      removeSongStatus,
      removeSongProgress,
      // jam
      isInJam,
      isOwner,
      shouldBroadcast,
      activeRoomId,
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
      playAudio,
      pauseAudio,
      next,
      previous,
      getRandomTracks,
      addSongToQueue,
      rmSongFromQueue,
      clearQueue,
      setSongStatus,
      removeSongStatus,
      removeSongProgress,
      // jam
      isInJam,
      isOwner,
      shouldBroadcast,
      activeRoomId,
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
    playing,
    semitone,
    setSemitone,
    volume,
    setVolume,
    vocalVolume,
    setVocalVolume,
    duration,
    seeking,
    setSeeking,
    vocalOn,
    setVocalOn,
    progress,
    setProgress,
    lyrics,
    currentLine,
    setCurrentLine,
    queue,
    setQueue,
    queueIdx,
    currentSong,
    playAudio,
    pauseAudio,
    next,
    previous,
    addSongToQueue,
    rmSongFromQueue,
    getRandomTracks,
    clearQueue,
    // jam
    isInJam,
    isOwner,
    shouldBroadcast,
    activeRoomId,
  } = ctx;

  const sendMessage = useWebSocketStore((state) => state.sendMessage);
  return {
    loading,
    playing,
    duration,
    semitone,
    volume,
    setVolume: (value: number) => {
      const newVolume = Math.min(1, Math.max(0, value));
      syncedPlayerRef.current?.setVolume(newVolume, vocalVolume);
      setVolume(newVolume);
    },
    seeking,
    setSeeking,
    progress,
    setProgress,
    vocalOn,
    play: () => {
      if (isOwner) {
        playAudio();
      }
      // if (shouldBroadcast) {
      sendMessage({
        type: 'jam',
        data: {
          action: 'control',
          op: 'play',
          roomId: activeRoomId,
        },
      });
      // }
    },
    pause: () => {
      if (isOwner) {
        pauseAudio();
      }
      // if (shouldBroadcast) {
      sendMessage({
        type: 'jam',
        data: {
          action: 'control',
          op: 'pause',
          roomId: activeRoomId,
        },
      });
      // }
    },
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
