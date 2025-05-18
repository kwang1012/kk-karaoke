import React, { forwardRef, useMemo, useRef, useState } from 'react';
import SongCard from './SongCard';
import { useTrackStore } from 'src/store/track';
import AppScrollbar from './Scrollbar';
import { Message } from 'src/store/ws';
import { Button } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { usePlayer } from 'src/store/player';
import TrackQueue from './TrackQueue';
import Jam from './Jam';
import { getUniqueId } from 'src/utils';
import { OverlayScrollbarsComponentRef } from 'overlayscrollbars-react';
import { useRoomStore } from 'src/store/room';

const QueueContainer = styled('div')(({ theme }) => ({
  gridArea: 'queue',
  height: '100%',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  minWidth: 280,
  width: 400,
  maxWidth: 400,
  backgroundColor: theme.palette.background.paper,
  borderRadius: 8,
  [theme.breakpoints.up('xl')]: {
    maxWidth: 420,
  },
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));

const Queue = forwardRef<HTMLDivElement>((props, ref) => {
  const scrollbarRef = useRef<OverlayScrollbarsComponentRef<'div'> | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const setSongStatus = useTrackStore((state) => state.setSongStatus);

  const { currentSong, queue, queueIdx } = usePlayer();
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
          const scrollbar = scrollbarRef.current;
          if (scrollbar) {
            const instance = scrollbar.osInstance();
            const viewport = instance?.elements().viewport;

            if (viewport) {
              viewport.scrollTop = viewport.scrollHeight; // scroll to bottom
            }
          }
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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  };
  return (
    <QueueContainer className="flex-1 h-full overflow-hidden" ref={ref}>
      <div className={['p-5 font-bold text-lg h-[68px] tracking-tighter', scrollTop > 0 ? 'shadow-xl' : ''].join(' ')}>
        Queue
      </div>
      <AppScrollbar className="h-full" ref={scrollbarRef} onScroll={handleScroll}>
        <div className="px-5 mt-5 font-bold text-lg tracking-tighter">Now playing</div>
        <div className="px-3">
          <SongCard className="mt-1" disableHover track={currentSong} />
        </div>

        <div className="mx-4 mt-5">
          <Jam />
        </div>

        <div className="pl-5 pr-2 mt-8 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tighter"> Music in queue</span>
          <Button
            disableRipple
            variant="text"
            className="p-0 bg-transparent text-sm text-[#b3b3b3] normal-case font-bold hover:text-white"
            onClick={clearQueue}
          >
            Clear queue
          </Button>
        </div>
        <div className="px-3">
          {tracks.length ? (
            <TrackQueue tracks={tracks} />
          ) : (
            <>
              <div className="text-gray-400 mt-2 w-full pl-2">There's no music in the queue.</div>
              <div className="mt-5 px-2 flex justify-center text-primary">
                <Button variant="contained" className="bg-primary" onClick={getRandomTracks}>
                  Random songs?
                </Button>
              </div>
            </>
          )}
        </div>
      </AppScrollbar>
    </QueueContainer>
  );
});

export default Queue;
