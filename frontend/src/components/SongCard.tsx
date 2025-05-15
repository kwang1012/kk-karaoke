import {
  Avatar,
  CircularProgress,
  CircularProgressProps,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Tooltip,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { memo, ReactElement, useMemo, useState } from 'react';
import placeholderImage from 'src/assets/placeholder.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGears, faMusic } from '@fortawesome/free-solid-svg-icons';
import { useTrackStore } from 'src/store';
import { useWebSocketStore } from 'src/store/ws';
import { CheckCircle, DeleteOutline, MoreHoriz, PlayArrow, QueueMusic } from '@mui/icons-material';
import AppMenu from './Menu';
import { Track } from 'src/models/spotify';

const CircularProgressWithLabel = ({
  children,
  value,
  ...props
}: { children?: ReactElement } & CircularProgressProps) => {
  return (
    <div className="relative inline-flex">
      {/* Background track */}
      {/* <CircularProgress
        {...props}
        className="absolute z-0"
        variant="determinate"
        value={100}
        sx={{
          color: '#535353', // light gray background
        }}
      /> */}
      <CircularProgress {...props} value={value} className="z-1" sx={{ color: 'white' }} />
      <div className="top-0 left-0 bottom-0 right-0 absolute flex items-center justify-center">
        {children ? children : <span className="text-xs">{value}%</span>}
      </div>
    </div>
  );
};

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
  '&.disabled': {
    backgroundColor: 'transparent !important',
    '*': {
      color: '#b3b3b3 !important',
    },
  },
  '&.disable-hover': {
    backgroundColor: 'transparent !important',
  },
  '&:hover, &.active': {
    '*': {
      color: theme.palette.mode == 'dark' ? 'white' : 'black',
    },
    '.checked-icon *': {
      color: theme.palette.success.main,
    },
    backgroundColor: '#ffffff1a',
    '& .actions': {
      opacity: 1,
    },
    '& .avatar': {
      display: 'none',
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
    track,
    onAdd,
    onDelete,
    onOpen,
    onClose,
    className,
  }: React.HTMLAttributes<HTMLDivElement> & {
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
        icon: <QueueMusic />,
        text: 'Add to queue',
      },
      {
        fn: onDelete,
        icon: <DeleteOutline />,
        text: 'Remove from queue',
      },
    ];
    return (
      <>
        <IconButton
          className={`row-actions interactive-section ${className}`}
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
                  className="interactive-section"
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
      </>
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
  const songStatus = useTrackStore((state) => state.songStatus);
  const songProgress = useTrackStore((state) => state.songProgress);
  const status = track ? songStatus[track.id] : 'ready';
  const progress = track ? songProgress[track.id] : 100;
  const isReady = !status || status === 'ready';
  const hasActions = useMemo(() => !!onAdd || !!onDelete, [onAdd, onDelete]);
  const disabled = useMemo(() => !isReady || disable, [isReady, disable]);
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
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const ready = useMemo(() => {
    return readyTracks.has(parsedTrack.id);
  }, [readyTracks, parsedTrack]);

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
        !isReady || disable ? 'disabled' : '',
        disableHover ? 'disable-hover' : '',
      ].join(' ')}
      {...props}
    >
      <div className="relative w-10 h-10 bg-[#b3b3b3] rounded-md mr-4 overflow-hidden shrink-0">
        {onAdd && !disable && (
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
        <span className="line-clamp-1">{parsedTrack.name}</span>
        <span className="text-sm text-gray-400 line-clamp-1">
          {parsedTrack.artists.map((artist, index) => (
            <span key={index}>
              {index > 0 && ', '}
              <a
                href={disabled ? undefined : artist.uri}
                target="_blank"
                rel="noopener noreferrer"
                className={['size-fit', disabled ? 'cursor-default' : 'hover:underline cursor-pointer'].join(' ')}
              >
                {artist.name}
              </a>
            </span>
          ))}
        </span>
      </div>
      {/* Only show ready icon if onAdd is not undefined */}
      {ready && onAdd && (
        <Tooltip placement="top" title="Ready">
          <CheckCircle fontSize="small" color="success" className="mr-2 checked-icon" />
        </Tooltip>
      )}
      {hasActions && !disabled && (
        <div className="flex items-center shrink-0 relative">
          {track?.orderedBy && (
            <Tooltip title={track.orderedBy.name} placement="top">
              <Avatar
                className="w-10 h-10 bg-[#bdb9a6] dark:bg-[#3a3a3a] border-none absolute avatar"
                alt={track.orderedBy.name}
                src={track.orderedBy.avatar}
              />
            </Tooltip>
          )}
          <ActionMenu
            className="actions"
            track={parsedTrack}
            onAdd={onAdd}
            onDelete={onDelete}
            onOpen={() => setMenuOpen(true)}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      )}
      {!isReady && !disable && (
        <div className="shrink-0">
          <CircularProgressWithLabel
            size={36}
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
