import { Track } from 'src/models/spotify';
import { createPrefetcher } from 'src/prefetch';
import { useTrackStore } from 'src/store';
import { api } from 'src/utils/api';

// apis
/** The room's queue. Rejects when the server cannot be reached: an empty list would look like an empty queue. */
export const fetchQueue = async (roomId: string) => {
  return api
    .get(`queue/${roomId}/tracks`)
    .then(({ data }) => {
      console.log('Fetched queue:', data);
      return data;
    })
    .catch((error) => {
      console.error('Error fetching queue:', error);
      throw error;
    });
};

const requestLyrics = async (songId: string) => {
  return api
    .get(`lyrics/${songId}`)
    .then(({ data }) => {
      // The server stores one delay per track, shared by everyone.
      useTrackStore.getState().setLyricsDelay(songId, data.delay ?? 0);
      useTrackStore.getState().setLyricsConfidence(songId, data.confidence ?? null);
      useTrackStore.getState().setPlainLyrics(songId, data.plain ?? null);
      useTrackStore.getState().setLyricsVideoId(songId, data.videoId ?? null);
      return data.lyrics;
    })
    .catch((error) => {
      console.error('Error fetching lyrics:', error);
    });
};

// The server takes a moment to answer (it checks storage for the newest lyrics), so the ones for the songs
// next to the current one are fetched ahead of time.
const lyricsPrefetcher = createPrefetcher(requestLyrics);

// load track/lyrics when currentTrack changes
export const fetchLyrics = (songId: string) => lyricsPrefetcher.get(songId);

/** Ask for a song's lyrics before they are needed, so skipping to it does not wait on the server. */
export const prefetchLyrics = (songId: string) => lyricsPrefetcher.prefetch(songId);

// fetch random tracks
export const fetchRandomTracks = async () => {
  return api
    .get('random_tracks')
    .then(({ data }) => {
      return data.tracks;
    })
    .catch((error) => {
      console.error('Error fetching default tracks:', error);
    });
};

// push track to queue
export const pushToQueue = async (roomId: string, track: Track) => {
  return api
    .post(`queue/${roomId}/add`, track)
    .then(({ data }) => {
      return data;
    })
    .catch((error) => {
      console.error('Error adding track to queue:', error);
    });
};

export const insertToQueue = async (roomId: string, track: Track) => {
  return api
    .post(`queue/${roomId}/add_to_next`, track)
    .then(({ data }) => {
      return data;
    })
    .catch((error) => {
      console.error('Error adding track to queue:', error);
    });
};

export const removeFromQueue = async (roomId: string, track: Track) => {
  return api
    .post(`queue/${roomId}/remove`, {
      ...track,
      time_added: track.timeAdded,
    })
    .then(({ data }) => data.track)
    .catch((error) => {
      console.error('Error removing track from queue:', error);
    });
};

export const downloadTrack = async (track: Track) => {
  return api
    .post(`/download`, track)
    .then(({ data }) => {
      return data;
    })
    .catch((error) => {
      console.error('Error downloading track:', error);
    });
};

export const emptyQueue = async (roomId: string) => {
  return api
    .post(`queue/${roomId}/tracks/clear`)
    .then(({ data }) => {
      return data;
    })
    .catch((error) => {
      console.error('Error clearing queue:', error);
    });
};

export const updateQueueIdx = async (roomId: string, idx: number) => {
  return api
    .post(`queue/${roomId}/update_queue_idx`, {
      index: idx,
    })
    .catch((error) => {
      console.log('Error updating queue index');
    });
};

export type MelodyNote = { note: number; start: number; end: number; line?: number; text?: string };

/** The notes sung in a song. `null` means not ready yet or unreachable (worth asking again); an empty list, that the song has none. */
export const fetchMelody = async (songId: string): Promise<MelodyNote[] | null> => {
  try {
    const { data, status } = await api.get(`tracks/midi/${songId}`);
    if (status === 202) return null;
    // The API camel-cases every JSON key (backend/middlewares/format.py): note_events arrives as noteEvents
    return Array.isArray(data?.noteEvents) ? (data.noteEvents as MelodyNote[]) : null;
  } catch (error: any) {
    if (error?.response?.status === 404) return [];
    console.error('Error fetching melody:', error);
    return null;
  }
};
