import { CircleArrowDown, Loader, Plus } from 'lucide-react';
import { memo, useContext, useEffect, useState } from 'react';
import { Skeleton } from 'src/components/ui/skeleton';
import { Track } from 'src/models/spotify';
import { useReadyTrackIds, useTrackStore } from 'src/store';
import placeholder from 'src/assets/placeholder.png';
import ActionMenu from './ActionMenu';
import ReadyBadge from 'src/components/ReadyBadge';
import { PlaylistContext } from 'src/context/playlist';
import { usePlaylistStore } from 'src/store/playlist';
import { Tooltip } from 'src/components/ui/tooltip';
import { IconButton } from 'src/components/ui/button';
import { TableCell, TableRow } from 'src/components/ui/table';
import { useBreakpointDown } from 'src/hooks/media';
import { cn } from 'src/lib/utils';
import { useT } from 'src/i18n';

export const HoverTableRow = ({ className, ...props }: React.ComponentProps<'tr'>) => (
  <TableRow
    className={cn(
      'group/row w-full cursor-default border-0 transition-colors hover:bg-accent [&_td]:border-0 [&_td]:p-2 [&_td:first-child]:rounded-l-xl [&_td:last-child]:rounded-r-xl',
      '[&_.row-actions]:opacity-0 hover:[&_.row-actions]:opacity-100 [&_.row-play]:pointer-events-none [&_.row-play]:opacity-0 hover:[&_.row-id]:opacity-0 hover:[&_.row-play]:pointer-events-auto hover:[&_.row-play]:opacity-100',
      'max-md:[&_.row-actions]:opacity-100 max-md:hover:bg-transparent max-md:hover:[&_.row-id]:opacity-100',
      className?.includes('active') && 'bg-accent [&_.row-actions]:opacity-100 [&_.row-id]:opacity-0 [&_.row-play]:pointer-events-auto [&_.row-play]:opacity-100',
      className
    )}
    {...props}
  />
);

export const getColWidth = (key: string) => {
  switch (key) {
    case 'artists':
      return 150;
    case 'row_id':
      return 50;
    case 'action':
      return 96; // ready check + download + menu
    default:
      return undefined;
  }
};

const PlaylistRow = memo(({ track, index }: { track: Track; index: number }) => {
  const t = useT();
  const mobile = useBreakpointDown('md');
  const songStatus = useTrackStore((state) => state.songStatus);
  // const status = track ? songStatus[track.id] : 'ready';
  const [status, setStatus] = useState(track?.status);
  const unknown = status === undefined; // for processing
  const downloaded = status === 'ready'; // for processing
  const readyTrackIds = useReadyTrackIds();
  const parsedTrack = track ?? {
    id: '',
    name: t('common.notPlaying'),
    artists: [],
    timeAdded: Date.now(),
  };
  const ready = readyTrackIds.has(parsedTrack.id);
  const setMenuOpenStatus = usePlaylistStore((state) => state.setMenuOpenStatus);
  const setMenuOpen = (open: boolean) => {
    setMenuOpenStatus(index, open);
  };
  const image = parsedTrack.album?.images?.[0]?.url || placeholder;
  const { collectionType, onAdd, onInsert, onDownload, isLoading, headers } = useContext(PlaylistContext);

  useEffect(() => {
    if (!track?.id) return;
    const newStatus = songStatus[track.id];
    if (newStatus && newStatus !== status) {
      setStatus(newStatus);
    }
  }, [track?.id, songStatus[track?.id || '']]);

  const trackRow = {
    row_id: (
      // the button stays laid out (only its opacity changes) so the tooltip can measure where it is
      <div className="relative mx-auto flex size-6 items-center justify-center">
        <span className="row-id transition-opacity">{index + 1}</span>
        {!mobile && !isLoading && (
          <Tooltip title={t('song.addToQueue')} side="top">
            <button
              aria-label={t('song.addToQueue')}
              className="row-play absolute inset-0 flex items-center justify-center rounded-full transition-opacity hover:bg-foreground/10"
              onClick={() => track && onAdd(parsedTrack)}
            >
              <Plus className="size-4" strokeWidth={2.5} />
            </button>
          </Tooltip>
        )}
      </div>
    ),
    name: !isLoading ? (
      <div className="flex items-center">
        {collectionType === 'playlist' && (
          <img referrerPolicy="no-referrer" src={image} className="mr-3 inline-block size-10 rounded-lg object-cover" alt={parsedTrack.name} />
        )}
        <div>
          <span className="line-clamp-1 font-medium">{parsedTrack.name}</span>
          {collectionType === 'album' && (
            <span className="text-muted-foreground">
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
      <Skeleton className="h-8 w-full" />
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
      <Skeleton className="h-8 w-full" />
    ),
    album: !isLoading ? (
      <span className="line-clamp-1">{parsedTrack.album?.name || '-'}</span>
    ) : (
      <Skeleton className="h-8 w-full" />
    ),
    action: !isLoading && (
      <div className="flex items-center justify-end">
        {ready || downloaded ? (
          <ReadyBadge variant="icon" className="mr-2" />
        ) : unknown ? (
          <Tooltip placement="top" title={t('playlist.download')}>
            <IconButton className="row-actions mr-2 p-0" onClick={() => onDownload(parsedTrack)}>
              <CircleArrowDown className="size-4" />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip placement="top" title={t('playlist.downloading')}>
            <Loader className="mr-2 size-4 animate-spin" />
          </Tooltip>
        )}
        <ActionMenu
          track={parsedTrack}
          onAdd={onAdd}
          onInsert={onInsert}
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
          style={{ width: getColWidth(header.key) }}
          className={cn(
            'py-0',
            header.key == 'row_id' ? 'text-center' : 'text-left',
            header.key == 'name' ? 'text-foreground' : 'text-muted-foreground',
            header.key == 'action' ? 'px-2' : 'px-4'
          )}
        >
          {trackRow[header.key as keyof typeof trackRow]}
        </TableCell>
      ))}
    </>
  );
});

export default PlaylistRow;
