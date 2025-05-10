import { useMemo, useRef, useState } from 'react';
import SongCard from './SongCard';
import { useAudioStore } from 'src/store/audio';
import AppScrollbar from './Scrollbar';
import { Message } from 'src/store/ws';
import Scrollbar from 'react-scrollbars-custom';
import { Button } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { usePlayer } from 'src/hooks/player';
import TrackQueue from './TrackQueue';
import Jam from './Jam';

const QueueLayout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
}));

export default function Queue() {
  const scrollbarRef = useRef<Scrollbar | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const setSongStatus = useAudioStore((state) => state.setSongStatus);

  const { currentSong, queue, queueIdx } = usePlayer();
  const { addToQueue, getRandomTracks, rmFromQueue, clearQueue } = usePlayer();

  const tracks = useMemo(() => {
    return queue.slice(queueIdx + 1).map((track, index) => ({
      index,
      ...track,
    }));
  }, [queue, queueIdx]);

  useRemoteMessageQueue('queue', {
    onAddItem: (item: Message) => {
      if (item.data.action === 'added') {
        addToQueue(item.data.track);
        requestAnimationFrame(() => {
          const scrollbar = scrollbarRef.current;
          if (scrollbar) {
            scrollbar.scrollToBottom();
          }
        });
      } else if (item.data.action === 'updated') {
        if (item.data.status === 'ready') {
          setSongStatus(item.data.songId, 'ready');
        }
      } else if (item.data.action === 'removed') {
        rmFromQueue(item.data.track);
      }
    },
  });

  const handleScroll = (el: Scrollbar) => {
    setScrollTop(el.scrollTop);
  };

  return (
    <QueueLayout className="flex-1 h-full text-white max-w-[400px]">
      <div className={['p-5 font-bold text-lg h-[68px] tracking-tighter', scrollTop > 0 ? 'shadow-xl' : ''].join(' ')}>
        Queue
      </div>
      <div className="h-full">
        <AppScrollbar className="h-full" ref={(el: Scrollbar) => (scrollbarRef.current = el)} onScroll={handleScroll}>
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
                  <Button variant="contained" className='bg-primary' onClick={getRandomTracks}>
                    Random songs?
                  </Button>
                </div>
              </>
            )}
          </div>
        </AppScrollbar>
      </div>
    </QueueLayout>
  );
}
