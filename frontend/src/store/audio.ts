import { create } from 'zustand';

export type SongStatus = 'submitted' | 'downloading_lyrics' | 'downloading_audio' | 'separating' | 'ready';
export interface AudioState {
  snackbar: {
    open: boolean; // Whether the snackbar is open
    key: number; // Unique key for the snackbar to force re-render
  };
  showSnackbar: () => void; // Set the state of the snackbar
  closeSnackbar: () => void; // Set the state of the snackbar
  lyricsDelays: Record<string, number>; // Delay of each song in the queue. used for adding song to queue
  setLyricsDelay: (songId: string, delay: number) => void; // Set the delay of a song in the queue
  songStatus: Record<string, SongStatus>; // Status of each song in the queue. used for adding song to queue
  setSongStatus: (songId: string, status: SongStatus) => void; // Set the status of a song in the queue
  removeSongStatus: (songId: string) => void; // Remove the status of a song in the queue
  songProgress: Record<string, number>; // Status of each song in the queue. used for adding song to queue
  setSongProgress: (songId: string, progress: number) => void; // Set the progress of a song in the queue
  removeSongProgress: (songId: string) => void; // Remove the progress of a song in the queue
}
export const useAudioStore = create<AudioState>((set, get) => ({
  snackbar: {
    open: false,
    key: 0,
  },
  // lyrics delay
  lyricsDelays: {},
  setLyricsDelay: (songId: string, delay: number) =>
    set((state) => ({
      lyricsDelays: {
        ...state.lyricsDelays,
        [songId]: delay,
      },
    })),
  songStatus: {},
  setSongStatus: (songId: string, status: SongStatus) =>
    set((state) => ({
      songStatus: {
        ...state.songStatus,
        [songId]: status,
      },
    })),
  removeSongStatus: (songId: string) => {
    const { [songId]: _, ...rest } = get().songStatus;
    set({
      songStatus: rest,
    });
  },
  songProgress: {},
  setSongProgress: (songId: string, progress: number) =>
    set((state) => ({
      songProgress: {
        ...state.songProgress,
        [songId]: progress,
      },
    })),
  removeSongProgress: (songId: string) => {
    const { [songId]: _, ...rest } = get().songProgress;
    set({
      songProgress: rest,
    });
  },
  // snackbar
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
}));
