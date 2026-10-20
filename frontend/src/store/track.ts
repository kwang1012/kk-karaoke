import { Track } from 'src/models/spotify';
import { api } from 'src/utils/api';
import { create } from 'zustand';

export type SongStatus = 'submitted' | 'downloading_lyrics' | 'downloading_audio' | 'separating' | 'ready' | 'error';
export type LyricsConfidence = 'verified' | 'synced' | 'approximate' | 'unsynced';
export interface TrackStore {
  readyTracks: Set<Track>; // The library: every processed track, ready to be played
  readyLoaded: boolean; // Whether the library has been fetched (successfully or not)
  readyError: boolean; // Whether fetching the library failed
  addReadyTrack: (track: Track) => void; // Add a track to the list of ready tracks
  setReadyTracks: (tracks: Track[]) => void; // Set the list of ready tracks
  lyricsDelays: Record<string, number>; // Delay of each track in the queue. used for adding track to queue
  setLyricsDelay: (songId: string, delay: number) => void; // Set the delay of a track in the queue
  lyricsConfidence: Record<string, LyricsConfidence | null>; // How far to trust each track's lyric timing
  setLyricsConfidence: (songId: string, confidence: LyricsConfidence | null) => void;
  lyricsVideoIds: Record<string, string | null>; // The YouTube recording each track's lyrics were timed against
  setLyricsVideoId: (songId: string, videoId: string | null) => void;
  plainLyrics: Record<string, string | null>; // Words-only lyrics, for tracks with no timed lyrics
  setPlainLyrics: (songId: string, text: string | null) => void;
  songStatus: Record<string, SongStatus>; // Status of each track in the queue. used for adding track to queue
  setSongStatus: (songId: string, status: SongStatus) => void; // Set the status of a track in the queue
  removeSongStatus: (songId: string) => void; // Remove the status of a track in the queue
  songProgress: Record<string, number>; // Status of each track in the queue. used for adding track to queue
  setSongProgress: (songId: string, progress: number) => void; // Set the progress of a track in the queue
  removeSongProgress: (songId: string) => void; // Remove the progress of a track in the queue
  getReadyTracks: () => Promise<void>; // Fetch the list of ready tracks from the API and update the state
}
export const useTrackStore = create<TrackStore>((set, get) => ({
  // lyrics delay
  readyTracks: new Set(), // List of tracks that are ready to be played
  readyLoaded: false,
  readyError: false,
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
  lyricsConfidence: {},
  setLyricsConfidence: (songId: string, confidence: LyricsConfidence | null) =>
    set((state) => ({ lyricsConfidence: { ...state.lyricsConfidence, [songId]: confidence } })),
  lyricsVideoIds: {},
  setLyricsVideoId: (songId: string, videoId: string | null) =>
    set((state) => ({ lyricsVideoIds: { ...state.lyricsVideoIds, [songId]: videoId } })),
  plainLyrics: {},
  setPlainLyrics: (songId: string, text: string | null) =>
    set((state) => ({ plainLyrics: { ...state.plainLyrics, [songId]: text } })),
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
    set({ readyError: false });
    return api
      .get('/library')
      .then(({ data }) => {
        set({ readyTracks: new Set(data.tracks), readyLoaded: true });
      })
      .catch((err) => {
        console.error(err);
        set({ readyLoaded: true, readyError: true });
      });
  },
}));

export const useReadyTrackIds = () => {
  const readyTracks = useTrackStore((state) => state.readyTracks);
  return new Set(Array.from(readyTracks.values()).map((track) => track.id));
};
