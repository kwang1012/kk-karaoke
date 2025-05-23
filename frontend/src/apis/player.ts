import { Track } from 'src/models/spotify';
import { api } from 'src/utils/api';

// apis
export const fetchQueue = async (roomId: string) => {
  return api
    .get(`queue/${roomId}/tracks`)
    .then(({ data }) => {
      return data;
    })
    .catch((error) => {
      console.error('Error fetching queue:', error);
      return {
        index: -1,
        tracks: [],
      };
    });
};

// load track/lyrics when currentTrack changes
export const fetchLyrics = async (songId: string) => {
  return api
    .get(`lyrics/${songId}`)
    .then(({ data }) => {
      return data.lyrics;
    })
    .catch((error) => {
      console.error('Error fetching lyrics:', error);
    });
};

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
