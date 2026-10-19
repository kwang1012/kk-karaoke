import { ReactElement, useEffect, useMemo, useState } from 'react';
import placeholderImage from 'src/assets/placeholder.png';
import { CircleCheck, CircleAlert, Cog, Music, Play } from 'lucide-react';
import { useReadyTrackIds, useTrackStore } from 'src/store';
import { Track } from 'src/models/spotify';
import ActionMenu from './playlist/ActionMenu';
import { Avatar, AvatarImage } from 'src/components/ui/avatar';
import { CircularProgress } from 'src/components/ui/progress';
import { Tooltip } from 'src/components/ui/tooltip';
import { useBreakpointDown } from 'src/hooks/media';
import { cn } from 'src/lib/utils';

const CircularProgressWithLabel = ({
  children,
  value,
  size,
  indeterminate,
}: {
  children?: ReactElement;
  value: number;
  size: number;
  indeterminate?: boolean;
}) => {
  return (
    <div className="relative inline-flex">
      <CircularProgress size={size} value={indeterminate ? undefined : value} />
      <div className="top-0 left-0 bottom-0 right-0 absolute flex items-center justify-center">
        {children ? children : <span className="text-xs">{value}%</span>}
      </div>
    </div>
  );
};

type SongCardProps = {
  className?: string;
  track?: Track | null;
  dense?: boolean;
  disable?: boolean;
  disableHover?: boolean;
  onAdd?: (track: Track) => void;
  onInsert?: (track: Track) => void;
  onDelete?: (track: Track) => void;
};
export default function SongCard({
  className,
  track,
  dense,
  disable,
  disableHover,
  onInsert,
  onAdd,
  onDelete,
  ...props
}: SongCardProps) {
  const songStatus = useTrackStore((state) => state.songStatus);
  const songProgress = useTrackStore((state) => state.songProgress);
  const hasActions = useMemo(() => !!onAdd || !!onDelete || !!onInsert, [onAdd, onDelete, onInsert]);
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
      return <Music className="size-3.5" />;
    if (status === 'separating') return <Cog className="size-3.5" />;
    return <></>;
  }, [status]);

  const [menuOpen, setMenuOpen] = useState(false);
  const mobile = useBreakpointDown('md');
  return (
    <div
      className={cn(
        'group/card relative flex h-14 cursor-default items-center gap-3 rounded-xl px-2 transition-colors',
        dense && 'h-12 px-1',
        !disabled && !disableHover && 'hover:bg-accent',
        menuOpen && !disableHover && 'bg-accent',
        disabled && 'opacity-50',
        className
      )}
      {...props}
    >
      <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        <img src={parsedTrack.album?.images?.[0]?.url || placeholderImage} className="size-full object-cover" />
        {onAdd && !disable && !mobile && (
          <button
            aria-label="Add to queue"
            className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover/card:opacity-100"
            onClick={() => track && onAdd(parsedTrack)}
          >
            <Play className="size-4 fill-current" />
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-sm font-medium">{parsedTrack.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {parsedTrack.artists.map((artist) => artist.name).join(', ')}
        </span>
      </div>
      {/* Only show ready icon if onAdd is not undefined */}
      {ready && onAdd && (
        <Tooltip placement="top" title="Ready">
          <CircleCheck className="size-4 shrink-0 text-success" />
        </Tooltip>
      )}
      {hasActions && !disabled && (
        <div className="relative flex shrink-0 items-center">
          {track?.orderedBy && (
            <Tooltip title={track.orderedBy.name} placement="top">
              <Avatar className="mr-1 size-7">
                <AvatarImage alt={track.orderedBy.name} src={track.orderedBy.avatar} />
              </Avatar>
            </Tooltip>
          )}
          <ActionMenu
            className={cn(!mobile && !menuOpen && 'opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100')}
            track={parsedTrack}
            onAdd={onAdd}
            onInsert={onInsert}
            onDelete={onDelete}
            onOpen={() => setMenuOpen(true)}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      )}
      {status === 'error' && !disable && (
        <Tooltip placement="top" title="Processing failed. Remove it and try again.">
          <CircleAlert className="size-4 shrink-0 text-destructive" />
        </Tooltip>
      )}
      {!isReady && status !== 'error' && !disable && (
        <div className="shrink-0">
          <CircularProgressWithLabel size={32} indeterminate={status !== 'separating'} value={progress}>
            {progressIcon}
          </CircularProgressWithLabel>
        </div>
      )}
    </div>
  );
}
