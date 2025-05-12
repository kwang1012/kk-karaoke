import { create } from 'zustand';

import {
  downloadTrack,
  emptyQueue,
  fetchRandomTracks,
  pushToQueue,
  removeFromQueue,
  updateQueueIdx,
} from 'src/apis/player';
import { Lyrics, Track } from 'src/models/spotify';
import { useTrackStore } from 'src/store/track';
import SyncedAudioPlayer from 'src/syncedPlayer';
import { useActiveRoomId, useJam, useRoomStore } from './room';
import { useWebSocketStore } from './ws';
import { createJSONStorage, persist } from 'zustand/middleware';

type PlayerStore = {
  syncedPlayer: SyncedAudioPlayer | null;
  setSyncedPlayer: (player: SyncedAudioPlayer) => void;
  // track context
  loading: boolean;
  setLoading: (loading: boolean) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  semitone: number;
  setSemitone: (semitone: number) => void;
  progress: number;
  setProgress: (value: number) => void;
  duration: number;
  setDuration: (value: number) => void;
  seeking: boolean;
  setSeeking: (seeking: boolean) => void;
  enabledPitchShift: boolean; // Whether pitch shift is enabled
  setEnabledPitchShift: (enabled: boolean) => void; // Set pitch shift enabled state
  vocalOn: boolean; // Set vocal on
  setVocalOn: (enabled: boolean) => void; // Set vocal on state
  volume: number; // Volume level
  setVolume: (volume: number) => void; // Set volume level
  // lyrics context
  lyrics: Lyrics[];
  setLyrics: (value: Lyrics[]) => void;
  currentLine: number;
  setCurrentLine: (value: number) => void;
  // queue context
  queue: Track[];
  setQueue: (value: Track[]) => void;
  queueIdx: number;
  setQueueIdx: (queIdx: number) => void;
  addToQueue: (track: Track) => void;
  rmFromQueue: (track: Track) => void;
  lastSongId: string | null;
  setLastSongId: (songId: string | null) => void;
  // apis
  getRandomTracks: () => Promise<void>;
  addSongToQueue: (track: Track) => Promise<void>;
  rmSongFromQueue: (track: Track) => Promise<void>;
  downloadSong: (track: Track) => Promise<void>;
  clearQueue: () => Promise<void>;
};

const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      syncedPlayer: null,
      setSyncedPlayer: (player: SyncedAudioPlayer) => set({ syncedPlayer: player }),
      loading: false,
      setLoading: (loading: boolean) => set({ loading }),
      playing: false,
      setPlaying: (playing: boolean) => set({ playing }),
      enabledPitchShift: false,
      vocalOn: false,
      setVocalOn: (enabled: boolean) => set({ vocalOn: enabled }),
      volume: 0.8,
      setVolume: (volume: number) => set({ volume }),
      setEnabledPitchShift: (enabled: boolean) => set({ enabledPitchShift: enabled }),
      semitone: 0,
      setSemitone: (semitone: number) => set({ semitone }),
      progress: 0,
      setProgress: (value: number) => set({ progress: value }),
      duration: 0,
      setDuration: (value: number) => set({ duration: value }),
      seeking: false,
      setSeeking: (seeking: boolean) => set({ seeking }),
      lyrics: [],
      setLyrics: (value: Lyrics[]) => set({ lyrics: value }),
      currentLine: -1,
      setCurrentLine: (value: number) => set({ currentLine: value }),
      queue: [],
      setQueue: (value: Track[]) => set({ queue: value }),
      queueIdx: 0,
      setQueueIdx: (queueIdx: number) => set({ queueIdx }),
      addToQueue: (track: Track) => {
        set((state) => ({
          queue: [...state.queue, track],
        }));
      },
      rmFromQueue: (track: Track) => {
        set((state) => ({
          queue: state.queue.filter((s) => s.id !== track.id || s.timeAdded !== track.timeAdded),
        }));
      },
      lastSongId: null,
      setLastSongId: (songId: string | null) => set({ lastSongId: songId }),
      getRandomTracks: async () => {
        fetchRandomTracks().then((tracks) => {
          set((prev) => ({
            queue: [...prev.queue, ...tracks],
          }));
        });
      },
      addSongToQueue: async (track: Track) => {
        useTrackStore.getState().setSongStatus(track.id, 'submitted');
        const roomId = useRoomStore.getState().roomId;
        const joinedRoomId = useRoomStore.getState().joinedRoom;
        const activeRoomId = joinedRoomId || roomId;
        pushToQueue(activeRoomId, track).then((data) => {
          if (data.isReady) {
            useTrackStore.getState().setSongStatus(track.id, 'ready');
          }
        });
      },
      rmSongFromQueue: async (track: Track) => {
        const roomId = useRoomStore.getState().roomId;
        const joinedRoomId = useRoomStore.getState().joinedRoom;
        const activeRoomId = joinedRoomId || roomId;
        removeFromQueue(activeRoomId, track).then((removedTrack) => {
          if (removedTrack) {
            useTrackStore.getState().removeSongStatus(removedTrack.id);
            useTrackStore.getState().removeSongProgress(removedTrack.id);
            const newQueue = get().queue.filter(
              (t) => t.timeAdded !== removedTrack.timeAdded || t.id !== removedTrack.id
            );
            set({ queue: newQueue });
          }
        });
      },
      downloadSong: async (track: Track) => {
        downloadTrack(track).then((data) => {
          // no task, is ready
          if (!data.task) {
            useTrackStore.getState().setSongStatus(track.id, 'ready');
            return;
          } else {
            useTrackStore.getState().setSongStatus(track.id, 'submitted');
          }
        });
      },
      clearQueue: async () => {
        const roomId = useRoomStore.getState().roomId;
        const joinedRoomId = useRoomStore.getState().joinedRoom;
        const activeRoomId = joinedRoomId || roomId;
        emptyQueue(activeRoomId).then(() => {
          set((state) => ({ queue: state.queue.slice(0, state.queueIdx + 1) }));
        });
      },
    }),
    {
      name: 'player-storage', // unique name
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        volume: state.volume,
        semitone: state.semitone,
        enabledPitchShift: state.enabledPitchShift,
        vocalOn: state.vocalOn,
      }),
    }
  )
);

export const usePlayer = () => {
  const store = usePlayerStore();
  const {
    syncedPlayer,
    loading,
    setPlaying,
    volume,
    setVolume,
    vocalOn,
    setVocalOn,
    semitone,
    setSemitone,
    setProgress,
    setLyrics,
    setCurrentLine,
    queue,
    queueIdx,
    setQueueIdx,
  } = store;
  const currentSong = queue[queueIdx] || null;

  const sendMessage = useWebSocketStore((state) => state.sendMessage);
  const activeRoomId = useActiveRoomId();
  const { isOwner } = useJam();

  // =============== functions that affect states ===============
  const next = (isCallback: boolean = false) => {
    if (queueIdx >= queue.length) {
      console.log('No next track in the queue');
      return;
    }

    if (isOwner) {
      updateQueueIdx(activeRoomId, queueIdx + 1);
    }
    setLyrics([]);
    setCurrentLine(-1);
    setProgress(0);
    setQueueIdx(queueIdx + 1);
    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'next',
      roomId: activeRoomId,
    });
  };

  const previous = (isCallback: boolean = false) => {
    if (queueIdx <= 0) {
      console.log('No previous track in the queue');
      return;
    }
    if (isOwner) {
      updateQueueIdx(activeRoomId, queueIdx - 1);
    }
    setLyrics([]);
    setCurrentLine(-1);
    setProgress(0);
    setQueueIdx(queueIdx - 1);
    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'previous',
      roomId: activeRoomId,
    });
  };

  // when is Callback is true, this function is called when receving the socket message
  const playAudio = (isCallback: boolean = false) => {
    if (loading) return;
    if (!currentSong || !syncedPlayer) return;

    if (isOwner) {
      syncedPlayer.setVolume(volume, vocalOn ? volume : 0);
      syncedPlayer.play();
    }
    setPlaying(true);

    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'play',
      roomId: activeRoomId,
    });
  };

  const pauseAudio = (isCallback: boolean = false) => {
    if (isOwner && syncedPlayer) {
      syncedPlayer.pause();
    }
    setPlaying(false);

    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'pause',
      roomId: activeRoomId,
    });
  };

  const toggleVocal = (isCallback: boolean = false) => {
    if (isOwner && syncedPlayer) {
      const newVolume = vocalOn ? 0 : volume;
      syncedPlayer.setVolume(volume, newVolume);
    }

    setVocalOn(!vocalOn);
    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'toggleVocal',
      roomId: activeRoomId,
    });
  };

  const setAudioVolume = (value: number, isCallback: boolean = false) => {
    if (isOwner && syncedPlayer) {
      syncedPlayer.setVolume(value, vocalOn ? value : 0);
    }
    setVolume(value);
    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'setVolume',
      roomId: activeRoomId,
      data: {
        volume: value,
      },
    });
  };
  const increaseVolume = (isCallback: boolean = false) => {
    const newVolume = Math.min(1, volume + 0.1);
    if (isOwner && syncedPlayer) {
      syncedPlayer.setVolume(newVolume, vocalOn ? newVolume : 0);
    }
    setAudioVolume(newVolume);
    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'increaseVolume',
      roomId: activeRoomId,
    });
  };
  const decreaseVolume = (isCallback: boolean = false) => {
    const newVolume = Math.max(0, volume - 0.1);
    if (isOwner && syncedPlayer) {
      syncedPlayer.setVolume(newVolume, vocalOn ? newVolume : 0);
    }
    setAudioVolume(newVolume);
    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'decreaseVolume',
      roomId: activeRoomId,
    });
  };
  const seek = (time: number, isCallback: boolean = false) => {
    if (isOwner && syncedPlayer) {
      syncedPlayer.seek(time);
    }
    setProgress(time);
    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'seek',
      roomId: activeRoomId,
      data: {
        seekTime: time,
      },
    });
  };
  const increaseSemitone = (isCallback: boolean = false) => {
    const newSemitone = Math.min(12, semitone + 1);
    if (isOwner && syncedPlayer) {
      syncedPlayer.setSemitone(newSemitone);
    }
    setSemitone(newSemitone);
    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'increaseSemitone',
      roomId: activeRoomId,
    });
  };
  const decreaseSemitone = (isCallback: boolean = false) => {
    const newSemitone = Math.max(-12, semitone - 1);
    if (isOwner && syncedPlayer) {
      syncedPlayer.setSemitone(newSemitone);
    }
    setSemitone(newSemitone);
    if (isCallback) return;
    sendMessage({
      type: 'jam',
      action: 'control',
      op: 'decreaseSemitone',
      roomId: activeRoomId,
    });
  };
  return {
    ...store,
    currentSong,
    next,
    previous,
    play: playAudio,
    pause: pauseAudio,
    // for compatibility
    playAudio,
    pauseAudio,
    vocalOn,
    toggleVocal,
    volume,
    setVolume: setAudioVolume,
    seek,
    increaseVolume,
    decreaseVolume,
    increaseSemitone,
    decreaseSemitone,
  };
};
