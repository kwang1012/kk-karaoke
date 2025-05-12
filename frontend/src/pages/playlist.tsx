import { AppBar, Toolbar, useTheme, useMediaQuery } from '@mui/material';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import AppScrollbar from 'src/components/Scrollbar';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import { useWebSocketStore } from 'src/store/ws';
import { useQuery } from '@tanstack/react-query';
import { styled } from '@mui/material/styles';
import { getAvgRGB } from 'src/utils';
import Scrollbar from 'react-scrollbars-custom';
import { usePlayerStore } from 'src/store/player';
import { Track, Collection, Album } from 'src/models/spotify';
import PlaylistTable from 'src/components/playlist/Table';

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

const Header = styled('div')(({ theme }) => ({
  display: 'grid',
  padding: 20,
  placeItems: 'center',
  gridTemplateColumns: 'auto 1fr',
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
    padding: 5,
    paddingTop: 15,
    '& .title': {
      padding: '0 75px 10px 75px',
    },
  },
}));

export default function PlaylistView() {
  const location = useLocation();
  const initCollection = location.state?.collection || {};
  const { id } = useParams();
  const collectionType = location.pathname.split('/')[1];
  const initialized = useWebSocketStore((state) => state.initialized);
  const connected = useWebSocketStore((state) => state.connected);
  const headerRef = useRef<HTMLDivElement>(null);
  const addSongToQueue = usePlayerStore((state) => state.addSongToQueue);
  const downloadSong = usePlayerStore((state) => state.downloadSong);

  const { data, isLoading } = useQuery({
    queryKey: [collectionType, id],
    queryFn: () => fetchTracks(collectionType, id || ''),
  });
  const collection = data?.collection || initCollection;
  const tracks = data?.tracks || [];
  const [color, setColor] = useState<string>('#535353');
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

  const onAdd = (track: Track) => {
    // Function to add a track to the queue
    if (collectionType === 'album') {
      track.album = collection as Album;
    }
    addSongToQueue(track);
  };
  const onDownload = (track: Track) => {
    downloadSong(track);
  };
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (!headerRef.current) return;
    setIsSticky(scrollTop > headerRef.current.clientHeight - 74); // header top + 10
    setHalfway(scrollTop > headerRef.current.clientHeight - 104);
  }, [scrollTop, headerRef]);
  const [halfway, setHalfway] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const showingTracks = useMemo(() => {
    if (isLoading) {
      const totalTracks = collectionType === 'album' ? collection.totalTracks : collection.tracks?.total || 0;
      return Array(totalTracks).fill({} as Track);
    }
    return tracks;
  }, [tracks, isLoading]);

  return (
    <div className="h-full relative pb-4">
      <AppBar
        position="absolute"
        className="text-white"
        style={{
          transition: 'background-color 0.3s ease-in-out',
          backgroundColor: halfway ? color : 'transparent',
        }}
        elevation={0}
      >
        {halfway && (
          <Toolbar>
            <>
              <img src={collectionImage} className="w-8 h-8 rounded-md" />
              <div className="text-xl ml-4 line-clamp-1">{collection.name}</div>
            </>
          </Toolbar>
        )}
      </AppBar>
      <AppScrollbar onScroll={(el: Scrollbar) => setScrollTop(el.scrollTop)}>
        <div className="h-full relative">
          {/* Header */}
          <Header
            ref={headerRef}
            className="h-[335px] md:h-[200px]"
            style={{
              backgroundImage: `linear-gradient(to bottom, ${color}, ${color}40)`,
            }}
          >
            <div className="title h-full shrink-0 w-full md:w-40 max-w-[400px]">
              <img src={collectionImage} className="w-full h-full object-cover rounded-md" alt={collection.name} />
            </div>
            <div className="ml-4 flex flex-col justify-center md:justify-start w-full">
              <span className="text-2xl md:text-4xl font-bold line-clamp-2 leading-tight">{collection.name}</span>
              <div className="text-sm text-gray-200 mt-1 line-clamp-1">{collection.description}</div>
            </div>
          </Header>
          <div
            style={{
              backgroundImage: `linear-gradient(to bottom, ${color}40, #121212)`,
            }}
            className="absolute top-[335px] md:top-[200px] w-full h-[150px] z-0"
          ></div>
          <div className="z-1 relative">
            <PlaylistTable
              collectionType={collectionType}
              tracks={showingTracks}
              onAdd={onAdd}
              onDownload={onDownload}
              initialized={initialized}
              connected={connected}
              isLoading={isLoading}
              isSticky={isSticky}
            />
          </div>
        </div>
      </AppScrollbar>
    </div>
  );
}
