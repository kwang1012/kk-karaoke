import { api } from 'src/utils/api';
import { create } from 'zustand';

const DEFAULT_VOCAL_VOLUME = 0.7; // Default vocal volume
const DEFAULT_INSTRUMENTAL_VOLUME = 1; // Default instrumental volume

export interface AudioState {
  currentTime: number; // Current playback time in seconds
  duration: number; // Total duration of the audio in seconds
  isSeeking: boolean; // Whether the user is currently seeking
  enableVocal: boolean; // Whether vocal is enabled
  instrumentalVolume: number; // Volume for the instrumental track
  vocalVolume: number; // Volume for the vocal track
  currentSong: Song | null; // Currently playing song
  queue: Song[];
  queueIdx: number;
  lyrics: Lyrics[]; // Lyrics for the current song
  currentLine: number; // Current line index in the lyrics
  snackbar: {
    open: boolean; // Whether the snackbar is open
    key: number; // Unique key for the snackbar to force re-render
  };
  setLyrics: (lyrics: Lyrics[]) => void;
  setCurrentLine: (line: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsSeeking: (seeking: boolean) => void;
  setEnableVocal: (enable: boolean) => void;
  setInstrumentalVolume: (volume: number) => void;
  setVocalVolume: (volume: number) => void;
  setCurrentSong: (song: Song | null) => void;
  setQueueIdx: (idx: number) => void;
  addToQueue: (song: Song) => void;
  next: () => void; // Move to the next song in the queue
  previous: () => void; // Move to the previous song in the queue
  showSnackbar: () => void; // Set the state of the snackbar
  closeSnackbar: () => void; // Set the state of the snackbar
  fetchLyrics: (songId: string) => Promise<void>; // Fetch lyrics for the current song
  fetchDefaultTracks: () => Promise<void>; // Fetch default tracks for testing
}
export const useAudioStore = create<AudioState>((set) => ({
  // Define your audio state and actions here
  currentTime: 0,
  duration: 0,
  isSeeking: false,
  enableVocal: false,
  instrumentalVolume: DEFAULT_INSTRUMENTAL_VOLUME, // Default volume
  vocalVolume: DEFAULT_VOCAL_VOLUME, // Default volume
  currentSong: null as Song | null, // Currently playing song
  queue: [],
  queueIdx: 0,
  lyrics: [],
  currentLine: -1,
  snackbar: {
    open: false,
    key: 0,
  },
  setCurrentLine: (line: number) => set({ currentLine: line }),
  setLyrics: (lyrics: Lyrics[]) => set({ lyrics }),
  setCurrentTime: (time: number) => set({ currentTime: time }),
  setDuration: (duration: number) => set({ duration }),
  setIsSeeking: (seeking: boolean) => set({ isSeeking: seeking }),
  setEnableVocal: (enable: boolean) => set({ enableVocal: enable }),
  setInstrumentalVolume: (volume: number) => set({ instrumentalVolume: volume }),
  setVocalVolume: (volume: number) => set({ vocalVolume: volume }),
  setCurrentSong: (song: Song | null) => set({ currentSong: song }),
  setQueueIdx: (idx: number) => set({ queueIdx: idx }),
  next: () =>
    set((state) => {
      const nextIdx = state.queueIdx + 1;
      return { queueIdx: nextIdx };
    }),
  previous: () =>
    set((state) => {
      const prevIdx = state.queueIdx - 1;
      return { queueIdx: prevIdx >= 0 ? prevIdx : 0 };
    }),
  addToQueue: (song: Song) =>
    set((state) => ({
      queue: [...state.queue, song],
    })),
  showSnackbar: () =>
    set((state) => ({
      snackbar: {
        open: true,
        key: state.snackbar.key + 1,
      },
    })),
  closeSnackbar: () =>
    set((state) => ({
      snackbar: {
        open: false,
        key: state.snackbar.key,
      },
    })),
  // api
  fetchLyrics: async (songId: string) => {
    try {
      const response = await api.get(`lyrics/${songId}`);
      const data = response.data;
      set({ lyrics: data.lyrics });
    } catch (error) {
      console.error('Failed to fetch lyrics:', error);
      set({ lyrics: [] });
    }
  },
  // for testing, remove later
  fetchDefaultTracks: async () => {
    try {
      const response = await api.get('tracks');
      const data = response.data;
      set({ queue: data.tracks });
    } catch (error) {
      console.error('Failed to fetch default tracks:', error);
    }
  },
}));

export function useCurrentSong() {
  const currentSong = useAudioStore((state) => state.queue[state.queueIdx] || null);
  return currentSong;
}
