import { create } from 'zustand';

import { Track } from 'src/models/spotify';
import { api } from 'src/utils/api';

/** How to treat a music video picked for the queue: ask which to use, always take the studio audio, or leave it. */
export type VersionMode = 'ask' | 'studio' | 'keep';
type Choice = 'studio' | 'video';

type Pending = { video: Track; studio: Track; resolve: (choice: Choice | null) => void };

type VersionChoiceStore = {
  pending: Pending | null;
  answer: (choice: Choice | null) => void;
};

export const useVersionChoice = create<VersionChoiceStore>((set, get) => ({
  pending: null,
  answer: (choice) => {
    get().pending?.resolve(choice);
    set({ pending: null });
  },
}));

/** The studio recording of a video (clean metadata, YouTube Music's own timed lyrics), when there is a confident one. */
export const fetchStudioVersion = async (track: Track): Promise<Track | null> => {
  try {
    const { data } = await api.get('studio_version', {
      params: {
        video_id: track.videoId ?? track.id,
        title: track.name,
        artists: (track.artists ?? []).map((a) => a.name).filter(Boolean).join(','),
        duration_ms: track.durationMs ?? undefined,
      },
    });
    return (data?.track as Track | null) ?? null;
  } catch {
    return null; // the lookup is a courtesy: the video itself is still a fine thing to queue
  }
};

/**
 * The track to queue for a pick. A video's title and channel are unreliable, so lyrics found by them can be
 * another song's; its studio recording is not. With 'ask' the person chooses; null means they cancelled.
 */
export async function chooseVersion(track: Track, mode: VersionMode = 'ask'): Promise<Track | null> {
  if (track.kind !== 'video' || mode === 'keep') return track;
  const studio = await fetchStudioVersion(track);
  if (!studio) return track;
  const keepOrder = { ...studio, timeAdded: track.timeAdded };
  if (mode === 'studio') return keepOrder;
  const choice = await new Promise<Choice | null>((resolve) => {
    // A second pick while one is open replaces it: the first is dropped rather than left hanging.
    useVersionChoice.getState().pending?.resolve(null);
    useVersionChoice.setState({ pending: { video: track, studio, resolve } });
  });
  return choice === 'studio' ? keepOrder : choice === 'video' ? track : null;
}
