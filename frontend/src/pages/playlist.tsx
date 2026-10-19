import { useBreakpointDown } from 'src/hooks/media';
import { useState, useMemo, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import { useWebSocketStore } from 'src/store/ws';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_BG_COLOR, getAvgRGB } from 'src/utils';
import { usePlayerStore } from 'src/store/player';
import { Track, Collection, Album } from 'src/models/spotify';
import PlaylistTable from 'src/components/playlist/Table';
import { ALBUM_HEADERS, PLAYLIST_HEADERS } from 'src/components/const/header';
import { PlaylistProvider } from 'src/context/playlist';
import { useDebouncedCallback } from 'src/hooks/debounce';

type ReturnType = {
  collection: Collection;
  tracks: Track[];
};

const fetchTracks = async (collectionType: string, id: string): Promise<ReturnType> => {
  return api
    .get(`/${collectionType}/${id}/tracks`)
    .then(({ data }) => {
      return data;
    })
    .catch((error) => {
      console.error('Error fetching tracks:', error);
      return { collection: {}, tracks: [] };
    });
};

export default function PlaylistView() {
  const location = useLocation();
  const initCollection = location.state?.collection || {};
  const { id } = useParams();
  const collectionType = location.pathname.split('/')[1];
  const connected = useWebSocketStore((state) => state.connected);
  const addSongToQueue = usePlayerStore((state) => state.addSongToQueue);
  const insertSongToQueue = usePlayerStore((state) => state.insertSongToQueue);
  const downloadSong = usePlayerStore((state) => state.downloadSong);

  const { data, isLoading } = useQuery({
    queryKey: [collectionType, id],
    queryFn: () => fetchTracks(collectionType, id || ''),
  });
  const collection = data?.collection || initCollection;
  const tracks = data?.tracks || [];
  const [color, setColor] = useState<string>(DEFAULT_BG_COLOR);
  const collectionImage = collection.images?.[0]?.url || placeholder;
  useEffect(() => {
    if (collectionImage) {
      getAvgRGB(collectionImage)
        .then((data) => {
          setColor(data);
        })
        .catch((error) => {
          console.error('Error fetching average RGB:', error);
        });
    }
  }, [collectionImage]);

  const onAdd = useDebouncedCallback((track: Track) => {
    // Function to add a track to the queue
    if (collectionType === 'album') {
      track.album = collection as Album;
    }
    addSongToQueue(track);
  }, 100);

  const onInsert = useDebouncedCallback((track: Track) => {
    // Function to insert a track into the queue
    if (collectionType === 'album') {
      track.album = collection as Album;
    }
    insertSongToQueue(track);
  }, 100);
  const onDownload = (track: Track) => {
    downloadSong(track);
  };
  const showingTracks = useMemo(() => {
    if (isLoading) {
      const totalTracks = collectionType === 'album' ? collection.totalTracks : collection.tracks?.total || 0;
      return Array(totalTracks).fill(undefined);
    }
    return tracks;
  }, [tracks, isLoading]);
  const [isSticky, setIsSticky] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [halfway, setHalfway] = useState(false);
  const mobile = useBreakpointDown('md');
  const headers = useMemo(() => {
    return collectionType === 'album' || mobile ? ALBUM_HEADERS : PLAYLIST_HEADERS;
  }, [collectionType, mobile]);

  return (
    <div className="w-full h-full relative pb-4">
      <header
        className="absolute inset-x-0 top-0 z-10 text-white transition-colors duration-200"
        style={{ backgroundColor: halfway ? color : 'transparent' }}
      >
        {halfway && (
          <div className="flex h-12 items-center px-4 md:h-16 md:px-6">
            <img src={collectionImage} className="w-8 h-8 rounded-md" />
            <div className="text-xl ml-4 line-clamp-1">{collection.name}</div>
          </div>
        )}
      </header>
      <PlaylistProvider
        value={{
          collectionType,
          collection,
          collectionImage,
          color,
          headers,
          onAdd,
          onInsert,
          onDownload,
          connected,
          isLoading,
          isSticky,
          setIsSticky,
          scrollTop,
          setScrollTop,
          halfway,
          setHalfway,
        }}
      >
        <PlaylistTable tracks={showingTracks} />
      </PlaylistProvider>
    </div>
  );
}
