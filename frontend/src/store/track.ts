import { Track } from 'src/models/spotify';
import { api } from 'src/utils/api';
import { create } from 'zustand';

export type SongStatus = 'submitted' | 'downloading_lyrics' | 'downloading_audio' | 'separating' | 'ready';
export interface TrackStore {
  readyTracks: Set<Track>; // List of tracks that are ready to be played
  addReadyTrack: (track: Track) => void; // Add a track to the list of ready tracks
  setReadyTracks: (tracks: Track[]) => void; // Set the list of ready tracks
  lyricsDelays: Record<string, number>; // Delay of each track in the queue. used for adding track to queue
  setLyricsDelay: (songId: string, delay: number) => void; // Set the delay of a track in the queue
  songStatus: Record<string, SongStatus>; // Status of each track in the queue. used for adding track to queue
  setSongStatus: (songId: string, status: SongStatus) => void; // Set the status of a track in the queue
  removeSongStatus: (songId: string) => void; // Remove the status of a track in the queue
  songProgress: Record<string, number>; // Status of each track in the queue. used for adding track to queue
  setSongProgress: (songId: string, progress: number) => void; // Set the progress of a track in the queue
  removeSongProgress: (songId: string) => void; // Remove the progress of a track in the queue
  getReadyTracks: () => void; // Fetch the list of ready tracks from the API and update the state
}
export const useTrackStore = create<TrackStore>((set, get) => ({
  // lyrics delay
  readyTracks: new Set(), // List of tracks that are ready to be played
  readyTrackIds: new Set(), // List of track ids that are ready to be played
  addReadyTrack: (track: Track) => {
    const { readyTracks } = get();
    readyTracks.add(track);
    set({ readyTracks });
  },
  setReadyTracks: (tracks: Track[]) => {
    const { readyTracks } = get();
    tracks.forEach((track) => {
      readyTracks.add(track);
    });
    set({ readyTracks });
  },
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
  getReadyTracks: () => {
    api
      .get('/tracks')
      .then(({ data }) => {
        set({
          readyTracks: new Set(data.readyTracks),
        });
      })
      .catch((err) => {
        console.error(err);
      });
  },
}));

export const useReadyTrackIds = () => {
  const readyTracks = useTrackStore((state) => state.readyTracks);
  return new Set(Array.from(readyTracks.values()).map((track) => track.id));
};
