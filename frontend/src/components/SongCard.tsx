import {
  Button,
  CircularProgress,
  CircularProgressProps,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { memo, ReactElement, useMemo, useState } from 'react';
import placeholderImage from 'src/assets/placeholder.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGears, faMusic } from '@fortawesome/free-solid-svg-icons';
import { useAudioStore } from 'src/store';
import { useWebSocketStore } from 'src/store/ws';
import { Delete, MoreHoriz, QueueMusic } from '@mui/icons-material';
import AppMenu from './Menu';

type SongCardProps = {
  className?: string;
  song: Song;
  dense?: boolean;
  disable?: boolean;
  onAdd?: (song: Song) => void;
  onDelete?: (song: Song) => void;
};

const CircularProgressWithLabel = ({ children, ...props }: { children?: ReactElement } & CircularProgressProps) => (
  <div className="relative inline-flex">
    <CircularProgress variant="determinate" {...props} />
    <div className="top-0 left-0 bottom-0 right-0 absolute flex items-center justify-center">
      {children ? children : <span className="text-white text-xs">{props.value}%</span>}
    </div>
  </div>
);

const HoverLayout = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  position: 'relative',
  overflow: 'hidden',
  borderRadius: theme.shape.borderRadius,
  margin: theme.spacing(0, 0, 2),
  cursor: 'default',
  '& .actions': {
    opacity: 0,
  },
  '&:hover, &.active': {
    '*': {
      color: 'white',
    },
    backgroundColor: '#ffffff1a',
    '& .actions': {
      opacity: 1,
    },
  },
  '&.active': {
    backgroundColor: '#ffffff3a',
  },
  [theme.breakpoints.down('md')]: {
    '& .actions': {
      opacity: 1,
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

export default function SongCard({ className, song, dense, disable, onAdd, onDelete, ...props }: SongCardProps) {
  const songStatus = useAudioStore((state) => state.songStatus);
  const songProgress = useAudioStore((state) => state.songProgress);
  const status = useMemo(() => songStatus[song.id], [songStatus, song.id]);
  const progress = useMemo(() => songProgress[song.id], [songProgress, song.id]);
  const isReady = useMemo(() => !status || status === 'ready', [status]);
  const initialized = useWebSocketStore((state) => state.initialized);
  const connected = useWebSocketStore((state) => state.connected);
  const hasActions = useMemo(() => !!onAdd || !!onDelete, [onAdd, onDelete]);
  const parsedSong = useMemo(() => {
    let albumImage: any;
    if (typeof song.album?.image === 'string') {
      albumImage = song.album.image;
    } else if (Array.isArray(song.album!.images) && song.album!.images!.length > 0) {
      albumImage = song.album!.images[0].url;
    } else {
      albumImage = placeholderImage; // Fallback to placeholder if no image is available
    }
    return {
      id: song.id,
      name: song.name,
      artists:
        song.artists.map((artist: any) => {
          if (typeof artist === 'string') return artist;
          return artist.name || artist; // Fallback to string if artist object is not structured
        }) || [],
      album: {
        name: song.album?.name || '',
        image: albumImage,
      },
    };
  }, [song]);

  const progressIcon = useMemo(() => {
    if (status === 'downloading_lyrics' || status === 'downloading_audio')
      return <FontAwesomeIcon width={20} widths={20} color="white" icon={faMusic} />;
    if (status === 'separating') return <FontAwesomeIcon width={20} height={20} color="white" icon={faGears} />;
    return <></>;
  }, [status]);

  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <HoverLayout
      className={[
        className,
        isReady && !disable && initialized && connected ? 'hover:bg-[#ffffff1a]' : '',
        dense ? 'py-0 px-1' : 'px-2',
        menuOpen ? 'active' : '',
      ].join(' ')}
      {...props}
    >
      {!isReady && !disable && (
        <div className="absolute inset-0 bg-[#3b3b3b] opacity-70 flex items-center justify-end px-4">
          <CircularProgressWithLabel
            size={36}
            sx={{ color: 'white' }}
            variant={status === 'separating' ? 'determinate' : 'indeterminate'}
            value={progress}
          >
            {progressIcon}
          </CircularProgressWithLabel>
        </div>
      )}
      <div className="w-10 h-10 bg-[#b3b3b3] rounded-md mr-4 overflow-hidden shrink-0">
        <img src={parsedSong.album.image} className="w-full h-full" />
      </div>
      <div className="flex flex-col justify-between py-1 flex-1">
        <span className="text-white line-clamp-1">{song.name}</span>
        <span className="text-sm text-gray-400 line-clamp-1">{parsedSong.artists.join(', ')}</span>
      </div>
      {hasActions && isReady && !disable && (
        <div className="actions shrink-0">
          <ActionMenu
            song={parsedSong}
            onAdd={onAdd}
            onOpen={() => setMenuOpen(true)}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      )}
    </HoverLayout>
  );
}
