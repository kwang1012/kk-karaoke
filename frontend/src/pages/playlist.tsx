import {
  TableRow,
  TableCell,
  AppBar,
  Toolbar,
  Table,
  TableHead,
  TableBody,
  useTheme,
  useMediaQuery,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import AppScrollbar from 'src/components/Scrollbar';
import { useAudioStore } from 'src/store';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import { useWebSocketStore } from 'src/store/ws';
import { useQuery } from '@tanstack/react-query';
import { styled } from '@mui/material/styles';
import Skeleton from 'react-loading-skeleton';
import { MoreHoriz, PlayArrow } from '@mui/icons-material';

const ALBUM_HEADERS = [
  {
    key: 'row_id',
    label: '#',
  },
  {
    key: 'name',
    label: 'Title',
  },
  {
    key: 'action',
    label: '',
  },
];

const PLAYLIST_HEADERS = [
  {
    key: 'row_id',
    label: '#',
  },
  {
    key: 'name',
    label: 'Title',
  },
  {
    key: 'album',
    label: 'Album',
  },
  {
    key: 'artists',
    label: 'Artists',
  },
  {
    key: 'action',
    label: '',
  },
];

type ReturnType = {
  collection: Collection;
  tracks: Song[];
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

const HoverTableRow = styled(TableRow)(({ theme }) => ({
  cursor: 'pointer',
  '& .row-actions': {
    visibility: 'hidden',
  },
  '& .row-id': {
    display: ' block',
  },
  '& .row-play': {
    display: 'none',
  },
  '&:hover .row-actions': {
    visibility: 'visible',
  },
  '&:hover': {
    backgroundColor: '#ffffff1a',
    '& .row-id': {
      display: 'none',
    },
    '& .row-play': {
      display: 'flex',
    },
  },
  [theme.breakpoints.down('md')]: {
    '& .row-actions': {
      visibility: 'visible',
    },
  },
}));

const Header = styled('div')(({ theme }) => ({
  display: 'grid',
  padding: 20,
  placeItems: 'center',
  gridTemplateColumns: 'auto 1fr',
  backgroundImage: 'linear-gradient(to bottom, #CC3363, #CC336340, #CC336310)',
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
    padding: 5,
    '& .title': {
      padding: '0 75px 10px 75px',
    },
  },
}));

const Actions = ({ song, addSongToQueue }: { song: Song; addSongToQueue: (song: Song) => void }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  return (
    <div>
      <IconButton
        id="demo-positioned-button"
        className="row-actions"
        sx={{ minWidth: 40 }}
        onClick={(e) => {
          e.stopPropagation();
          console.log('More: ', song);
          handleClick(e);
        }}
        aria-controls={open ? 'demo-positioned-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
      >
        <MoreHoriz className="text-[#b3b3b3]" />
      </IconButton>
      {/* <Menu
        id="demo-positioned-menu"
        aria-labelledby="demo-positioned-button"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        <MenuItem onClick={handleClose}>Profile</MenuItem>
        <MenuItem onClick={handleClose}>My account</MenuItem>
        <MenuItem onClick={handleClose}>Logout</MenuItem>
      </Menu> */}
    </div>
  );
};

const TrackRow = (
  i: number,
  collectionType: string,
  headers: { key: string; label: string }[],
  song: Song,
  initialized: boolean,
  connected: boolean,
  addSongToQueue: (song: Song) => void
) => {
  const trackRow = {
    row_id: (
      <>
        <span className="row-id">{i + 1}</span>
        <PlayArrow className="row-play" fontSize="small" />
      </>
    ),
    name: (
      <div className="flex items-center">
        {collectionType === 'playlist' && (
          <img
            src={song.album?.image || placeholder}
            className="w-10 h-10 object-cover rounded-md inline-block mr-2"
            alt={song.name}
          />
        )}
        <div>
          <span className="line-clamp-1 ml-2">{song.name}</span>
          {collectionType === 'album' && <span className="text-gray-400 ml-2">{song.artists.join(',')}</span>}
        </div>
      </div>
    ),
    artists: <span className="line-clamp-1">{song.artists.join(', ')}</span>,
    album: <span className="line-clamp-1">{song.album?.name || '-'}</span>,
    action: <Actions song={song} addSongToQueue={addSongToQueue} />,
  };
  const getWidth = (key: string) => {
    switch (key) {
      case 'artists':
        return 120;
      case 'row_id':
      case 'action':
        return 30;
      default:
        return undefined;
    }
  };
  return (
    <HoverTableRow
      key={i}
      sx={{ '& td': { border: 0, py: 2 } }}
      onClick={() => initialized && connected && addSongToQueue(song)}
    >
      {headers.map((header) => (
        <TableCell
          key={header.key}
          width={getWidth(header.key)}
          align={header.key == 'row_id' ? 'center' : 'left'}
          sx={{
            color: header.key == 'name' ? 'white' : '#b3b3b3',
            paddingY: 0,
          }}
        >
          {trackRow[header.key]}
        </TableCell>
      ))}
    </HoverTableRow>
  );
};

export default function PlaylistView() {
  const location = useLocation();
  const initCollection = location.state?.collection || {};
  const { id } = useParams();
  const setSongStatus = useAudioStore((state) => state.setSongStatus);
  const collectionType = useMemo(() => location.pathname.split('/')[1], [location.pathname]);
  const initialized = useWebSocketStore((state) => state.initialized);
  const connected = useWebSocketStore((state) => state.connected);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.clientHeight);
    }
  }, [headerRef]);

  const headers = useMemo(() => {
    return collectionType === 'album' || mobile ? ALBUM_HEADERS : PLAYLIST_HEADERS;
  }, [collectionType]);

  const { data, isLoading } = useQuery({
    queryKey: [collectionType, id],
    queryFn: () => fetchTracks(collectionType, id || ''),
  });
  const collection = useMemo(() => data?.collection || initCollection, [data, initCollection]);
  const tracks = useMemo(() => data?.tracks || [], [data]);

  const addSongToQueue = (song: Song) => {
    // Function to add a song to the queue
    if (collectionType === 'album') {
      song.album = collection;
    }
    api
      .post('/queue/add', song)
      .then(({ data }) => {
        if (data.is_ready) {
          setSongStatus(song.id, 'ready');
        } else {
          setSongStatus(song.id, 'submitted');
        }
      })
      .catch((error) => {
        console.error('Error adding song to queue:', error);
      });
  };

  const [scrollPosition, setScrollPosition] = useState(0);

  const handleScroll = (el: any) => {
    setScrollPosition(el.scrollTop);
  };
  const toolbarStyle = useMemo(() => {
    const newOpacity = Math.min(1, (scrollPosition - 0.7 * headerHeight) / (headerHeight - 0.7 * headerHeight));
    return {
      backgroundColor: 'black',
      opacity: newOpacity,
    };
  }, [scrollPosition, headerHeight]);

  return (
    <div className="h-full relative pb-4">
      <AppBar position="absolute" sx={{ transition: 'none', zIndex: 2, ...toolbarStyle }}>
        <Toolbar variant="dense">
          {scrollPosition > 100 && (
            <>
              <img src={collection.image || placeholder} className="w-8 h-8 rounded-md" />
              <div className="text-xl ml-4 line-clamp-1">{collection.name}</div>
            </>
          )}
        </Toolbar>
      </AppBar>
      <AppScrollbar onScroll={handleScroll}>
        <div className="h-full">
          {/* Header */}
          <Header ref={headerRef}>
            <div className="title h-full shrink-0 w-full md:w-40 max-w-[400px]">
              <img
                src={collection.image || placeholder}
                className="w-full h-full object-cover rounded-md"
                alt={collection.name}
              />
            </div>
            <div className="description ml-4 flex flex-col justify-center">
              <span className="text-2xl md:text-4xl font-bold line-clamp-2 leading-1.5">{collection.name}</span>
              <div className="text-sm text-gray-200 mt-1 line-clamp-1">{collection.description}</div>
            </div>
          </Header>
          <div>
            <div className="text-white">
              <Table aria-label="simple table" stickyHeader>
                <TableHead>
                  <TableRow
                    sx={{
                      '& th': { borderColor: '#b3b3b3', bgcolor: '#1a1a1a', top: 48 },
                    }}
                  >
                    {headers.map((header) => (
                      <TableCell
                        key={header.key}
                        align={header.key == 'row_id' ? 'center' : 'left'}
                        sx={{ color: '#b3b3b3', pt: 2, pb: 2 }}
                      >
                        {header.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                {!isLoading && (
                  <TableBody>
                    {tracks.map((track, i) =>
                      TrackRow(i, collectionType, headers, track, initialized, connected, addSongToQueue)
                    )}
                  </TableBody>
                )}
              </Table>
              {isLoading && (
                <div className="p-5 pt-3">
                  <Skeleton
                    count={10}
                    baseColor="#1f1f1f"
                    highlightColor="#2a2a2a"
                    width="100%"
                    height={48}
                    className="my-1"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </AppScrollbar>
    </div>
  );
}
