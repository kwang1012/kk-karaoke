import { create } from 'zustand';
import type { Track } from 'src/models/spotify';
import type { FollowNow } from 'src/spotifyFollow';

/** What following Spotify is doing right now, for the settings panel. */
export const useSpotifyFollowStore = create<{ now: FollowNow<Track> | null; setNow: (now: FollowNow<Track> | null) => void }>((set) => ({
  now: null,
  setNow: (now) => set({ now }),
}));
