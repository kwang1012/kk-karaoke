import { useEffect, useState } from 'react';
import { api } from 'src/utils/api';

function IndexView() {
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    console.log('Fetching songs...');
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    return api
      .get('/top-chinese-songs')
      .then(({ data }) => {
        console.log('Fetched songs:', data);
        setSongs(data['songs'] || []);
      })
      .catch((error) => {
        console.error('Error fetching songs:', error);
      });
  };
  return <div className="p-8 text-white">THIS IS THE INDEX PAGE</div>;
}

export default IndexView;
