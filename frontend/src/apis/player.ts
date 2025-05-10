import { Track } from 'src/models/spotify';
import { api } from 'src/utils/api';

// apis
export const fetchQueue = async (roomId: string) => {
  return api
    .get(`queue/${roomId}/songs`)
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

// load track/lyrics when currentSong changes
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
    .get('tracks')
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

export const removeFromQueue = async (roomId: string, track: Track) => {
  // TODO: implement remove track from queue
  return api.post(`queue/${roomId}/remove`, track).catch((error) => {
    console.error('Error removing track from queue:', error);
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
  return api.post(`queue/${roomId}/${idx}`).catch((error) => {
    console.log('Error updating queue index');
  });
};
