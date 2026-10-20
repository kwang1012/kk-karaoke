import { ReactElement, useMemo, useState } from 'react';
import placeholderImage from 'src/assets/placeholder.png';
import { CircleAlert, Cog, Music, Plus } from 'lucide-react';
import { useReadyTrackIds, useTrackStore } from 'src/store';
import { Track } from 'src/models/spotify';
import ActionMenu from './playlist/ActionMenu';
import ReadyBadge from './ReadyBadge';
import { Avatar, AvatarImage } from 'src/components/ui/avatar';
import { CircularProgress } from 'src/components/ui/progress';
import { Tooltip } from 'src/components/ui/tooltip';
import { useBreakpointDown } from 'src/hooks/media';
import { cn } from 'src/lib/utils';
import { useT } from 'src/i18n';

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
  const t = useT();
  const songStatus = useTrackStore((state) => state.songStatus);
  const songProgress = useTrackStore((state) => state.songProgress);
  const hasActions = useMemo(() => !!onAdd || !!onDelete || !!onInsert, [onAdd, onDelete, onInsert]);
  // Derived from the current track (not copied into state): cards get reused for a different
  // song when a list changes, and state would keep showing the previous song's status.
  const status = (track?.id && songStatus[track.id]) || track?.status || 'ready';
  const progress = (track?.id && songProgress[track.id]) || track?.progress || 0;
  const readyTrackIds = useReadyTrackIds();
  // The server saying the files exist wins over a status that may be stale (a missed message).
  const isReady = !status || status === 'ready' || (!!track?.id && readyTrackIds.has(track.id));
  const disabled = useMemo(() => !isReady || disable, [isReady, disable]);

  const parsedTrack = useMemo(() => {
    if (!track)
      return {
        id: '',
        name: t('common.notPlaying'),
        artists: [],
        timeAdded: Date.now(),
      };
    return track;
  }, [track]);
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
        'group/card relative flex h-14 min-w-0 cursor-default items-center gap-3 rounded-xl px-2 transition-colors',
        dense && 'h-12 px-1',
        !disabled && !disableHover && 'hover:bg-accent',
        menuOpen && !disableHover && 'bg-accent',
        disabled && 'opacity-50',
        className
      )}
      {...props}
    >
      <div className="relative size-10 shrink-0">
        <div className="absolute inset-0 overflow-hidden rounded-lg bg-muted">
        <img referrerPolicy="no-referrer" src={parsedTrack.album?.images?.[0]?.url || placeholderImage} className="size-full object-cover" />
          {onAdd && !disable && !mobile && (
            <button
              aria-label={t('song.addToQueue')}
              className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover/card:opacity-100"
              onClick={() => track && onAdd(parsedTrack)}
            >
              <Plus className="size-5" strokeWidth={2.5} />
            </button>
          )}
        </div>
        {ready && onAdd && <ReadyBadge variant="dot" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-sm font-medium" title={parsedTrack.name}>
          {parsedTrack.name}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {parsedTrack.kind === 'video' && (
            <span className="mr-1.5 rounded border px-1 py-px text-[10px] font-medium uppercase">{t('song.video')}</span>
          )}
          {parsedTrack.artists.map((artist) => artist.name).join(', ')}
        </span>
      </div>
      {status === 'error' && !disable && (
        <Tooltip placement="top" title={t('song.failed')}>
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
      {/* shown while the song is still processing too: who added it, and a way to remove it */}
      {hasActions && !disable && (
        // On desktop the avatar and the menu share one slot at the right: the avatar fades out while the
        // card is hovered (or its menu is open) and the menu takes its place. Mobile shows both.
        <div className="relative flex shrink-0 items-center md:size-8">
          {track?.orderedBy && (
            <Tooltip title={track.orderedBy.name} placement="top">
              <Avatar
                className={cn(
                  'mr-1 size-7 transition-opacity md:absolute md:inset-0 md:m-auto md:mr-auto',
                  'md:group-focus-within/card:opacity-0 md:group-hover/card:opacity-0',
                  menuOpen && 'md:opacity-0'
                )}
              >
                <AvatarImage alt={track.orderedBy.name} src={track.orderedBy.avatar} />
              </Avatar>
            </Tooltip>
          )}
          <div className="md:absolute md:inset-0">
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
        </div>
      )}
    </div>
  );
}
