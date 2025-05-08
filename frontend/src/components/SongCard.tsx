import { Button, CircularProgress, CircularProgressProps, IconButton, Menu, MenuItem } from '@mui/material';
import { styled } from '@mui/material/styles';
import { ReactElement, useMemo, useState } from 'react';
import placeholderImage from 'src/assets/placeholder.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGears, faMusic } from '@fortawesome/free-solid-svg-icons';
import { useAudioStore } from 'src/store';
import { useWebSocketStore } from 'src/store/ws';
import { MoreHoriz } from '@mui/icons-material';

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
  '& .actions': {
    visibility: 'hidden',
  },
  '&:hover': {
    // backgroundColor: theme.palette.action.hover,
    '& .actions': {
      visibility: 'visible',
    },
  },
}));

const ActionMenu = ({ song, onAdd }: { song: Song; onAdd?: (song: Song) => void }) => {
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
      <Menu
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
      </Menu>
    </div>
  );
};

export default function SongCard({ className, song, dense, disable, onAdd, onDelete, ...props }: SongCardProps) {
  const songStatus = useAudioStore((state) => state.songStatus);
  const songProgress = useAudioStore((state) => state.songProgress);
  const status = useMemo(() => songStatus[song.id], [songStatus, song.id]);
  const progress = useMemo(() => songProgress[song.id], [songProgress, song.id]);
  const isReady = useMemo(() => !status || status === 'ready', [status]);
  const initialized = useWebSocketStore((state) => state.initialized);
  const connected = useWebSocketStore((state) => state.connected);
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
  return (
    <HoverLayout
      className={[
        className,
        isReady && !disable && initialized && connected ? 'hover:bg-[#ffffff1a]' : '',
        dense ? 'py-0 px-1' : 'px-2',
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
      <div className="actions shrink-0">
        <ActionMenu song={song} onAdd={onAdd} />
        {/* {isReady && onAdd && initialized && connected && !disable && (
          <IconButton variant="outlined" onClick={() => onAdd(parsedSong)}>
            Add
          </IconButton>
        )} */}
        {/* {isReady && onDelete && initialized && connected && !disable && (
          <Button variant="outlined" onClick={() => onDelete(parsedSong)}>
            Remove
          </Button>
        )} */}
      </div>
    </HoverLayout>
  );
}
