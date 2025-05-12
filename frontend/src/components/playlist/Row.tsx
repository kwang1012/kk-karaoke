import { PlayArrow, CheckCircle, DownloadForOfflineOutlined, Downloading } from '@mui/icons-material';
import { styled, TableRow, Tooltip, IconButton, TableCell } from '@mui/material';
import { useContext, useMemo, useState } from 'react';
import Skeleton from 'react-loading-skeleton';
import { Track } from 'src/models/spotify';
import { useTrackStore } from 'src/store';
import placeholder from 'src/assets/placeholder.png';
import ActionMenu from './ActionMenu';
import { PlaylistContext } from 'src/context/playlist';

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

export default function PlaylistRow({ track, index }: { track: Track; index: number }) {
  const songStatus = useTrackStore((state) => state.songStatus);
  const status = track ? songStatus[track.id] : 'ready';
  const unknown = status === undefined; // for processing
  const downloaded = status === 'ready'; // for processing
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const parsedTrack = track ?? {
    id: '',
    name: 'Not playing',
    artists: [],
    timeAdded: Date.now(),
  };
  const ready = readyTracks.has(parsedTrack.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const image = parsedTrack.album?.images?.[0]?.url || placeholder;
  const { collectionType, onAdd, onDownload, initialized, connected, isLoading, headers } = useContext(PlaylistContext);
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
          <span className="line-clamp-1">{parsedTrack.name}</span>
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
    <HoverTableRow key={index} className={menuOpen ? 'active' : ''} sx={{ '& td': { border: 0, py: 2 } }}>
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
    </HoverTableRow>
  );
}
