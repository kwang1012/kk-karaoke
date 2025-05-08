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
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { useState, useMemo, useRef, useEffect, memo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import AppScrollbar from 'src/components/Scrollbar';
import { useAudioStore } from 'src/store';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import { useWebSocketStore } from 'src/store/ws';
import { useQuery } from '@tanstack/react-query';
import { styled } from '@mui/material/styles';
import Skeleton from 'react-loading-skeleton';
import { Delete, MoreHoriz, PlayArrow, QueueMusic } from '@mui/icons-material';
import AppMenu from 'src/components/Menu';
import { getAvgRGB } from 'src/utils';
import Scrollbar from 'react-scrollbars-custom';

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
  cursor: 'default',
  '& .row-actions': {
    opacity: 0,
  },
  '& .row-id': {
    display: ' block',
  },
  '& .row-play': {
    display: 'none',
  },
  '&:hover, &.active': {
    '*': {
      color: 'white',
    },
    backgroundColor: '#ffffff1a',
    '.row-actions': {
      opacity: 1,
    },
    '& .row-id': {
      display: 'none',
    },
    '& .row-play': {
      display: 'flex',
    },
  },
  '&.active': {
    backgroundColor: '#ffffff3a',
  },
  [theme.breakpoints.down('md')]: {
    '& .row-actions': {
      opacity: 1,
    },
  },
}));

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

const ActionMenu = memo(
  ({
    song,
    onAdd,
    onDelete,
    onOpen,
    onClose,
  }: {
    song: Song;
    onAdd?: (song: Song) => void;
    onDelete?: (song: Song) => void;
    onOpen: () => void;
    onClose: () => void;
  }) => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const id = open ? 'simple-popover' : undefined;
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
      onOpen();
    };
    const handleClose = () => {
      setAnchorEl(null);
      onClose();
    };
    return (
      <div>
        <IconButton
          className="row-actions"
          sx={{ minWidth: 40 }}
          onClick={(e) => {
            e.stopPropagation();
            handleClick(e);
          }}
          aria-describedby={id}
        >
          <MoreHoriz className="text-[#b3b3b3]" />
        </IconButton>
        <AppMenu id={id} open={open} anchorEl={anchorEl} onClose={handleClose}>
          {onAdd && (
            <MenuItem
              onClick={() => {
                onAdd(song);
                handleClose();
              }}
            >
              <ListItemIcon>
                <QueueMusic />
              </ListItemIcon>
              <ListItemText>Add to queue</ListItemText>
            </MenuItem>
          )}
          {onDelete && (
            <MenuItem
              onClick={() => {
                onDelete(song);
                handleClose();
              }}
            >
              <ListItemIcon>
                <Delete />
              </ListItemIcon>
              <ListItemText>Remove from queue</ListItemText>
            </MenuItem>
          )}
        </AppMenu>
      </div>
    );
  }
);

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

const TrackRow = memo(
  ({
    index,
    collectionType,
    headers,
    song,
    initialized,
    connected,
    onAdd,
  }: {
    index: number;
    collectionType: string;
    headers: { key: string; label: string }[];
    song: Song;
    initialized: boolean;
    connected: boolean;
    onAdd: (song: Song) => void;
  }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const trackRow = {
      row_id: (
        <div className="flex items-center justify-center">
          <span className="row-id">{index + 1}</span>
          <div className="cursor-pointer" onClick={() => initialized && connected && onAdd(song)}>
            <PlayArrow className="row-play" fontSize="small" />
          </div>
        </div>
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
      action: (
        <ActionMenu song={song} onAdd={onAdd} onOpen={() => setMenuOpen(true)} onClose={() => setMenuOpen(false)} />
      ),
    };
    return (
      <HoverTableRow key={index} className={menuOpen ? 'active' : ''} sx={{ '& td': { border: 0, py: 2 } }}>
        {headers.map((header) => (
          <TableCell
            key={header.key}
            width={getWidth(header.key)}
            align={header.key == 'row_id' ? 'center' : 'left'}
            sx={{
              color: header.key == 'name' ? 'white' : '#b3b3b3',
              paddingY: 0,
              paddingX: header.key == 'action' ? 1 : 2,
            }}
          >
            {trackRow[header.key]}
          </TableCell>
        ))}
      </HoverTableRow>
    );
  }
);

export default function PlaylistView() {
  const location = useLocation();
  const initCollection = location.state?.collection || {};
  const { id } = useParams();
  const setSongStatus = useAudioStore((state) => state.setSongStatus);
  const collectionType = useMemo(() => location.pathname.split('/')[1], [location.pathname]);
  const initialized = useWebSocketStore((state) => state.initialized);
  const connected = useWebSocketStore((state) => state.connected);
  const headerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));

  const headers = useMemo(() => {
    return collectionType === 'album' || mobile ? ALBUM_HEADERS : PLAYLIST_HEADERS;
  }, [collectionType]);

  const { data, isLoading } = useQuery({
    queryKey: [collectionType, id],
    queryFn: () => fetchTracks(collectionType, id || ''),
  });
  const collection = useMemo(() => data?.collection || initCollection, [data, initCollection]);
  const tracks = useMemo(() => data?.tracks || [], [data]);
  const [color, setColor] = useState<string>('#535353');
  useEffect(() => {
    if (collection.image) {
      getAvgRGB(collection.image)
        .then((data) => {
          setColor(data);
        })
        .catch((error) => {
          console.error('Error fetching average RGB:', error);
        });
    }
  }, [collection.image]);

  const addSongToQueue = (song: Song) => {
    // Function to add a song to the queue
    if (collectionType === 'album') {
      song.album = collection;
    }
    setSongStatus(song.id, 'submitted');
    api
      .post('/queue/add', song)
      .then(({ data }) => {
        if (data.is_ready) {
          setSongStatus(song.id, 'ready');
        }
      })
      .catch((error) => {
        console.error('Error adding song to queue:', error);
      });
  };
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (!headerRef.current) return;
    setIsSticky(scrollTop > headerRef.current.clientHeight - 74); // header top + 10
    setHalfway(scrollTop > headerRef.current.clientHeight - 104);
  }, [scrollTop, headerRef]);
  const [halfway, setHalfway] = useState(false);
  const [isSticky, setIsSticky] = useState(false);

  return (
    <div className="h-full relative pb-4">
      <AppBar
        position="absolute"
        className={[
          'text-white',
          'transition-opacity duration-300 ease-in-out',
          halfway ? 'opacity-100 bg-black' : 'bg-transparent opacity-0',
        ].join(' ')}
        elevation={0}
      >
        <Toolbar>
          <>
            <img src={collection.image || placeholder} className="w-8 h-8 rounded-md" />
            <div className="text-xl ml-4 line-clamp-1">{collection.name}</div>
          </>
        </Toolbar>
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
              <img
                src={collection.image || placeholder}
                className="w-full h-full object-cover rounded-md"
                alt={collection.name}
              />
            </div>
            <div className="description ml-4 flex flex-col justify-center md:justify-start w-full">
              <span className="text-2xl md:text-4xl font-bold line-clamp-2 leading-1.5">{collection.name}</span>
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
            <div className="text-white">
              <Table aria-label="simple table" stickyHeader>
                <TableHead>
                  <TableRow
                    sx={{
                      '& th': { borderColor: '#b3b3b3', bgcolor: isSticky ? '#1a1a1a' : 'transparent', top: 64 },
                    }}
                  >
                    {headers.map((header) => (
                      <TableCell
                        key={header.key}
                        width={getWidth(header.key)}
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
                    {tracks.map((track, i) => (
                      <TrackRow
                        key={i}
                        index={i}
                        collectionType={collectionType}
                        headers={headers}
                        song={track}
                        onAdd={addSongToQueue}
                        initialized={initialized}
                        connected={connected}
                      />
                    ))}
                  </TableBody>
                )}
              </Table>
              {isLoading && (
                <div className="p-5 pt-3">
                  <Skeleton
                    count={10}
                    baseColor="transparent"
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
