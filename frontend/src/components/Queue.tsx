import { useMemo, useRef } from 'react';
import SongCard from './SongCard';
import { useTrackStore } from 'src/store/track';
import AppScrollbar from './Scrollbar';
import { Message } from 'src/store/ws';
import { Button } from 'src/components/ui/button';
import { Shuffle } from 'lucide-react';
import { cn } from 'src/lib/utils';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { usePlayer } from 'src/store/player';
import TrackQueue from './TrackQueue';
import Jam from './Jam';
import { getUniqueId } from 'src/utils';
import { useRoomStore } from 'src/store/room';

/** Always mounted (even when hidden) because it owns the websocket queue listener. */
export default function Queue({ hidden }: { hidden?: boolean }) {
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const setSongStatus = useTrackStore((state) => state.setSongStatus);

  const { currentTrack, queue, queueIdx } = usePlayer();
  const { addToQueue, insertToQueue, getRandomTracks, rmFromQueue, clearQueue, setQueue } = usePlayer();
  const roomId = useRoomStore((state) => state.roomId);
  const tracks = useMemo(() => {
    return queue.slice(queueIdx + 1).map((track, index) => ({
      index,
      ...track,
      uniqueId: getUniqueId(track),
    }));
  }, [queue, queueIdx]);

  useRemoteMessageQueue('queue', {
    onAddItem: (item: Message) => {
      if (item.data.action === 'added') {
        addToQueue(item.data.track);
        requestAnimationFrame(() => {
          const viewport = scrollbarRef.current;
          if (viewport) viewport.scrollTop = viewport.scrollHeight; // scroll to bottom
        });
      } else if (item.data.action === 'updated') {
        if (item.data.status === 'ready') {
          setSongStatus(item.data.track.id, 'ready');
        }
      } else if (item.data.action === 'removed') {
        rmFromQueue(item.data.track);
      } else if (item.data.action === 'reordered') {
        const id = item.data.id;
        if (id === roomId) return; // ignore message if owner
        const oldIndex = item.data.oldIdx;
        const newIndex = item.data.newIdx;
        // the index here is already offset by queueIdx + 1, should be the same as the index in tracks
        const newItems = [...queue];
        const [element] = newItems.splice(oldIndex, 1);
        newItems.splice(newIndex, 0, element);
        setQueue(newItems);
      } else if (item.data.action === 'inserted') {
        insertToQueue(item.data.track);
      }
    },
  });

  return (
    <aside
      className={cn(
        'flex w-[360px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-card max-md:hidden',
        hidden && 'hidden'
      )}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-lg font-semibold">Queue</h2>
        {tracks.length > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearQueue}>
            Clear
          </Button>
        )}
      </div>
      <AppScrollbar className="min-h-0 flex-1 px-3 pb-4" ref={scrollbarRef}>
        <div className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Now playing</div>
        <SongCard disableHover className="rounded-xl bg-accent/60" track={currentTrack} />

        <div className="mt-4">
          <Jam />
        </div>

        <div className="mt-6 px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Next up</div>
        {tracks.length ? (
          <TrackQueue tracks={tracks} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">Nothing queued yet.</p>
            <Button size="sm" onClick={getRandomTracks}>
              <Shuffle /> Surprise me
            </Button>
          </div>
        )}
      </AppScrollbar>
    </aside>
  );
}
