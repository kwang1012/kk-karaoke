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
    });
};

// load song/lyrics when currentSong changes
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

// push song to queue
export const pushToQueue = async (roomId: string, song: Song) => {
  return api
    .post(`queue/${roomId}/add`, song)
    .then(({ data }) => {
      return data;
    })
    .catch((error) => {
      console.error('Error adding song to queue:', error);
    });
};

export const removeFromQueue = async (roomId: string, song: Song) => {
  // TODO: implement remove song from queue
  return api.post(`queue/${roomId}/remove`, song).catch((error) => {
    console.error('Error removing song from queue:', error);
  });
};
