import { PlayArrow, CheckCircle, DownloadForOfflineOutlined, Downloading } from '@mui/icons-material';
import { styled, TableRow, Tooltip, IconButton, TableCell, useMediaQuery } from '@mui/material';
import { memo, useContext, useEffect, useMemo, useState } from 'react';
import Skeleton from 'react-loading-skeleton';
import { Track } from 'src/models/spotify';
import { useReadyTrackIds, useTrackStore } from 'src/store';
import placeholder from 'src/assets/placeholder.png';
import ActionMenu from './ActionMenu';
import { PlaylistContext } from 'src/context/playlist';
import { usePlaylistStore } from 'src/store/playlist';

export const HoverTableRow = styled(TableRow)(({ theme }) => ({
  cursor: 'default',
  width: '100%',
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
      color: theme.palette.mode == 'dark' ? 'white' : 'black',
    },
    '& .checked-icon *': {
      color: theme.palette.success.main,
    },
    backgroundColor: theme.palette.mode === 'dark' ? '#ffffff1a' : '#0000001a',
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
  '& td': {
    border: 0,
    padding: 8,
  },
  [theme.breakpoints.down('md')]: {
    '& .row-actions': {
      opacity: 1,
    },
    '*': {
      color: theme.palette.mode == 'dark' ? 'white' : 'black',
    },
    '& .checked-icon *': {
      color: theme.palette.success.main,
    },
    '&:hover, &.active': {
      backgroundColor: 'transparent',
      '& .row-id': {
        display: 'flex',
      },
    },
  },
}));

export const getColWidth = (key: string) => {
  switch (key) {
    case 'artists':
      return 150;
    case 'row_id':
    case 'action':
      return 50;
    default:
      return undefined;
  }
};

const PlaylistRow = memo(({ track, index }: { track: Track; index: number }) => {
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const songStatus = useTrackStore((state) => state.songStatus);
  // const status = track ? songStatus[track.id] : 'ready';
  const [status, setStatus] = useState(track?.status);
  const unknown = status === undefined; // for processing
  const downloaded = status === 'ready'; // for processing
  const readyTrackIds = useReadyTrackIds();
  const parsedTrack = track ?? {
    id: '',
    name: 'Not playing',
    artists: [],
    timeAdded: Date.now(),
  };
  const ready = readyTrackIds.has(parsedTrack.id);
  const setMenuOpenStatus = usePlaylistStore((state) => state.setMenuOpenStatus);
  const setMenuOpen = (open: boolean) => {
    setMenuOpenStatus(index, open);
  };
  const image = parsedTrack.album?.images?.[0]?.url || placeholder;
  const { collectionType, onAdd, onDownload, isLoading, headers } = useContext(PlaylistContext);

  useEffect(() => {
    if (!track?.id) return;
    const newStatus = songStatus[track.id];
    if (newStatus && newStatus !== status) {
      setStatus(newStatus);
    }
  }, [track?.id, songStatus[track?.id || '']]);

  const trackRow = {
    row_id: (
      <div className="flex items-center justify-center">
        <span className="row-id">{index + 1}</span>
        {!mobile && (
          <div className="cursor-pointer" onClick={() => track && onAdd(parsedTrack)}>
            <PlayArrow className="row-play" fontSize="small" />
          </div>
        )}
      </div>
    ),
    name: !isLoading ? (
      <div className="flex items-center">
        {collectionType === 'playlist' && (
          <img src={image} className="w-10 h-10 object-cover rounded-md inline-block mr-2" alt={parsedTrack.name} />
        )}
        <div>
          <span className="line-clamp-1 text-black dark:text-white">{parsedTrack.name}</span>
          {collectionType === 'album' && (
            <span className="text-gray-400">
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
        {ready || downloaded ? (
          <Tooltip placement="top" title="Ready">
            <CheckCircle fontSize="small" color="success" className="mr-2 checked-icon" />
          </Tooltip>
        ) : unknown ? (
          <Tooltip placement="top" title="Download and process">
            <IconButton disableRipple className="p-0 mr-2 row-actions" onClick={() => onDownload(parsedTrack)}>
              <DownloadForOfflineOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip placement="top" title="Downloading">
            <Downloading fontSize="small" className="mr-2" />
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
    <>
      {headers.map((header) => (
        <TableCell
          key={header.key}
          width={getColWidth(header.key)}
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
    </>
  );
});

export default PlaylistRow;
