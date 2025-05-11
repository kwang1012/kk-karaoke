import {
  CircularProgress,
  CircularProgressProps,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { memo, ReactElement, useMemo, useState } from 'react';
import placeholderImage from 'src/assets/placeholder.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGears, faMusic } from '@fortawesome/free-solid-svg-icons';
import { useAudioStore } from 'src/store';
import { useWebSocketStore } from 'src/store/ws';
import { DeleteOutline, MoreHoriz, PlayArrow } from '@mui/icons-material';
import AppMenu from './Menu';
import { Track } from 'src/models/spotify';

const CircularProgressWithLabel = ({ children, ...props }: { children?: ReactElement } & CircularProgressProps) => (
  <div className="relative inline-flex">
    {/* Background track */}
    {props.variant === 'determinate' && (
      <CircularProgress
        {...props}
        className="absolute"
        variant="determinate"
        value={100}
        sx={{
          color: '#a0a0a0', // light gray background
        }}
      />
    )}
    <CircularProgress {...props} />
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
  height: 52,
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
  '&.disable-hover': {
    '&:hover, &:active': {
      backgroundColor: 'transparent',
    },
  },
  [theme.breakpoints.down('md')]: {
    '& .actions': {
      opacity: 1,
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
      event.stopPropagation();
      setAnchorEl(event.currentTarget);
      onOpen();
    };
    const handleClose = () => {
      setAnchorEl(null);
      onClose();
    };
    const functions = [
      {
        fn: onAdd,
        icon: <PlayArrow />,
        text: 'Play',
      },
      {
        fn: onDelete,
        icon: <DeleteOutline />,
        text: 'Remove from queue',
      },
    ];
    return (
      <div>
        <IconButton
          className="row-actions"
          disableTouchRipple
          sx={{ minWidth: 40 }}
          onClick={(e) => {
            e.stopPropagation();
            handleClick(e);
          }}
          aria-describedby={id}
        >
          <MoreHoriz style={{ color: '#b3b3b3' }} />
        </IconButton>
        <AppMenu id={id} open={open} anchorEl={anchorEl} onClose={handleClose}>
          {functions.map(
            (func, index) =>
              func.fn && (
                <MenuItem
                  key={index}
                  onClick={() => {
                    if (!track || !func.fn) return;
                    func.fn(track);
                    handleClose();
                  }}
                >
                  <ListItemIcon
                    sx={{
                      '& svg': {
                        fill: '#b3b3b3',
                      },
                    }}
                  >
                    {func.icon}
                  </ListItemIcon>
                  <ListItemText className="text-[#b3b3b3]">{func.text}</ListItemText>
                </MenuItem>
              )
          )}
        </AppMenu>
      </div>
    );
  }
);

type SongCardProps = {
  className?: string;
  track?: Track | null;
  dense?: boolean;
  disable?: boolean;
  disableHover?: boolean;
  onAdd?: (track: Track) => void;
  onDelete?: (track: Track) => void;
};
export default function SongCard({
  className,
  track,
  dense,
  disable,
  disableHover,
  onAdd,
  onDelete,
  ...props
}: SongCardProps) {
  const songStatus = useAudioStore((state) => state.songStatus);
  const songProgress = useAudioStore((state) => state.songProgress);
  const status = useMemo(() => (track ? songStatus[track.id] : 'ready'), [songStatus, track?.id]);
  const progress = useMemo(() => (track ? songProgress[track.id] : 100), [songProgress, track?.id]);
  const isReady = useMemo(() => !status || status === 'ready', [status]);
  const initialized = useWebSocketStore((state) => state.initialized);
  const connected = useWebSocketStore((state) => state.connected);
  const hasActions = useMemo(() => !!onAdd || !!onDelete, [onAdd, onDelete]);
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
        dense ? 'py-0 px-1' : 'px-2',
        menuOpen ? 'active' : '',
        !isReady || disable ? 'disable-hover' : '',
      ].join(' ')}
      {...props}
    >
      <div className="relative w-10 h-10 bg-[#b3b3b3] rounded-md mr-4 overflow-hidden shrink-0">
        {onAdd && (
          <div
            className="actions absolute flex items-center justify-center w-full h-full bg-[#3b3b3b70] cursor-pointer"
            onClick={() => track && onAdd(parsedTrack)}
          >
            <PlayArrow />
          </div>
        )}
        <img src={parsedTrack.album?.images[0].url || placeholderImage} className="w-full h-full" />
      </div>
      <div className="flex flex-col justify-between py-1 flex-1">
        <span className="text-white line-clamp-1">{parsedTrack.name}</span>
        <span className="text-sm text-gray-400 line-clamp-1">
          {parsedTrack.artists.map((artist, index) => (
            <span key={index}>
              {index > 0 && ', '}
              <a
                href={artist.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline cursor-pointer size-fit"
              >
                {artist.name}
              </a>
            </span>
          ))}
        </span>
      </div>
      {hasActions && isReady && !disable && (
        <div className="actions shrink-0">
          <ActionMenu
            track={parsedTrack}
            onAdd={onAdd}
            onDelete={onDelete}
            onOpen={() => setMenuOpen(true)}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      )}
      {!isReady && !disable && (
        <div className="flex items-center justify-end px-4">
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
    </HoverLayout>
  );
}
