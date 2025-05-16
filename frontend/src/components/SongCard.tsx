import { Avatar, CircularProgress, CircularProgressProps, Tooltip, useMediaQuery } from '@mui/material';
import { styled } from '@mui/material/styles';
import { ReactElement, useEffect, useMemo, useState } from 'react';
import placeholderImage from 'src/assets/placeholder.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGears, faMusic } from '@fortawesome/free-solid-svg-icons';
import { useReadyTrackIds, useTrackStore } from 'src/store';
import { CheckCircle, PlayArrow } from '@mui/icons-material';
import { Track } from 'src/models/spotify';
import ActionMenu from './playlist/ActionMenu';

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
    backgroundColor: theme.palette.mode == 'dark' ? '#ffffff1a' : '#0000001a',
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
    '*': {
      color: theme.palette.mode == 'dark' ? 'white' : 'black',
    },
    '&:hover, &.active': {
      backgroundColor: 'transparent',
    },
  },
}));

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
  const hasActions = useMemo(() => !!onAdd || !!onDelete, [onAdd, onDelete]);
  const [status, setStatus] = useState(track?.status || 'ready');
  const [progress, setProgress] = useState(track?.progress || 0);
  const isReady = !status || status === 'ready';
  const disabled = useMemo(() => !isReady || disable, [isReady, disable]);

  // Update only when songStatus[track.id] changes
  useEffect(() => {
    if (!track?.id) return;
    const newStatus = songStatus[track.id];
    if (newStatus && newStatus !== status) {
      setStatus(newStatus);
    }
  }, [track?.id, songStatus[track?.id || '']]);
  //  ? songProgress[track.id] : 100;
  useEffect(() => {
    if (!track?.id) return;
    const newProgress = songProgress[track.id];
    if (newProgress && newProgress !== progress) {
      setProgress(newProgress);
    }
  }, [track?.id, songProgress[track?.id || '']]);
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
  const readyTrackIds = useReadyTrackIds();
  const ready = useMemo(() => {
    return readyTrackIds.has(parsedTrack.id);
  }, [readyTrackIds, parsedTrack]);

  const progressIcon = useMemo(() => {
    if (status === 'downloading_lyrics' || status === 'downloading_audio')
      return <FontAwesomeIcon width={20} widths={20} color="white" icon={faMusic} />;
    if (status === 'separating') return <FontAwesomeIcon width={20} height={20} color="white" icon={faGears} />;
    return <></>;
  }, [status]);

  const [menuOpen, setMenuOpen] = useState(false);
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
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
                // href={disabled ? undefined : artist.uri}
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
                className={['w-10 h-10 border-none', mobile ? 'relative' : 'absolute avatar'].join(' ')}
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
