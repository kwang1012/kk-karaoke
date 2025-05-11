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
  Tooltip,
} from '@mui/material';
import { useState, useMemo, useRef, useEffect, memo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import AppScrollbar from 'src/components/Scrollbar';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import { useWebSocketStore } from 'src/store/ws';
import { useQuery } from '@tanstack/react-query';
import { styled } from '@mui/material/styles';
import Skeleton from 'react-loading-skeleton';
import { CheckCircle, Delete, MoreHoriz, PlayArrow, QueueMusic } from '@mui/icons-material';
import AppMenu from 'src/components/Menu';
import { getAvgRGB } from 'src/utils';
import Scrollbar from 'react-scrollbars-custom';
import { usePlayer } from 'src/hooks/player';
import { Track, Collection, Album } from 'src/models/spotify';
import { useTrackStore } from 'src/store';

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
    '& .checked-icon *': {
      color: theme.palette.success.main,
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
    track,
    onAdd,
    onDelete,
    onOpen,
    onClose,
  }: {
    track: Track;
    onAdd?: (track: Track) => void;
    onDelete?: (track: Track) => void;
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
                onAdd(track);
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
                onDelete(track);
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
      return 150;
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
    track,
    initialized,
    connected,
    onAdd,
    isLoading,
  }: {
    index: number;
    collectionType: string;
    headers: { key: string; label: string }[];
    track?: Track;
    initialized: boolean;
    connected: boolean;
    onAdd: (track: Track) => void;
    isLoading: boolean;
  }) => {
    const readyTracks = useTrackStore((state) => state.readyTracks);
    const parsedTrack = useMemo(() => {
      if (!track)
        return {
          id: '',
          name: 'Not playing',
          artists: [],
          timeAdded: Date.now(),
        };
      return track;
    }, [track]);
    const ready = useMemo(() => {
      return readyTracks.has(parsedTrack.id);
    }, [readyTracks, parsedTrack]);
    const [menuOpen, setMenuOpen] = useState(false);
    const image = parsedTrack.album?.images?.[0]?.url || placeholder;
    const trackRow = {
      row_id: (
        <div className="flex items-center justify-center">
          <span className="row-id">{index + 1}</span>
          <div className="cursor-pointer" onClick={() => initialized && connected && track && onAdd(parsedTrack)}>
            <PlayArrow className="row-play" fontSize="small" />
          </div>
        </div>
      ),
      name: !isLoading ? (
        <div className="flex items-center">
          {collectionType === 'playlist' && (
            <img src={image} className="w-10 h-10 object-cover rounded-md inline-block mr-2" alt={parsedTrack.name} />
          )}
          <div>
            <span className="line-clamp-1 ml-2">{parsedTrack.name}</span>
            {collectionType === 'album' && (
              <span className="text-gray-400 ml-2">
                {parsedTrack.artists.map((artist, index) => (
                  <span key={index}>
                    {index > 0 && ', '}
                    <a
                      href={artist.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline cursor-pointer"
                    >
                      {artist.name}
                    </a>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      ) : (
        <Skeleton baseColor="transparent" highlightColor="#ffffff1a" width="100%" height={32} />
      ),
      artists: !isLoading ? (
        <span className="line-clamp-1">
          {parsedTrack.artists.map((artist, index) => (
            <span key={index}>
              {index > 0 && ', '}
              <a href={artist.uri} target="_blank" rel="noopener noreferrer" className="hover:underline cursor-pointer">
                {artist.name}
              </a>
            </span>
          ))}
        </span>
      ) : (
        <Skeleton baseColor="transparent" highlightColor="#ffffff1a" width="100%" height={32} />
      ),
      album: !isLoading ? (
        <span className="line-clamp-1">{parsedTrack.album?.name || '-'}</span>
      ) : (
        <Skeleton baseColor="transparent" highlightColor="#ffffff1a" width="100%" height={32} />
      ),
      action: !isLoading && (
        <div className="flex items-center justify-end">
          {ready && (
            <Tooltip placement="top" title="Ready">
              <CheckCircle fontSize="small" color="success" className="mr-2 checked-icon" />
            </Tooltip>
          )}
          <ActionMenu
            track={parsedTrack}
            onAdd={onAdd}
            onOpen={() => setMenuOpen(true)}
            onClose={() => setMenuOpen(false)}
          />
        </div>
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
  const collectionType = useMemo(() => location.pathname.split('/')[1], [location.pathname]);
  const initialized = useWebSocketStore((state) => state.initialized);
  const connected = useWebSocketStore((state) => state.connected);
  const headerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const { addSongToQueue } = usePlayer();

  const headers = useMemo(() => {
    return collectionType === 'album' || mobile ? ALBUM_HEADERS : PLAYLIST_HEADERS;
  }, [collectionType]);

  const { data, isLoading } = useQuery({
    queryKey: [collectionType, id],
    queryFn: () => fetchTracks(collectionType, id || ''),
  });
  const collection = useMemo<Collection>(() => data?.collection || initCollection, [data, initCollection]);
  const tracks = useMemo(() => data?.tracks || [], [data]);
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
              <span className="text-2xl md:text-4xl font-bold line-clamp-2 leading-relaxed">{collection.name}</span>
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
                      '& th': {
                        borderColor: '#b3b3b3',
                        bgcolor: isSticky ? '#1a1a1a' : 'transparent',
                        top: mobile ? 56 : 64,
                      },
                    }}
                  >
                    {headers.map((header) => (
                      <TableCell
                        key={header.key}
                        width={getWidth(header.key)}
                        align={header.key == 'row_id' ? 'center' : 'left'}
                        sx={{ color: '#b3b3b3', padding: 2 }}
                      >
                        {header.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {showingTracks.map((track, i) => (
                    <TrackRow
                      key={i}
                      index={i}
                      collectionType={collectionType}
                      headers={headers}
                      track={track}
                      onAdd={onAdd}
                      initialized={initialized}
                      connected={connected}
                      isLoading={isLoading}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </AppScrollbar>
    </div>
  );
}
