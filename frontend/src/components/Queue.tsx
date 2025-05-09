import { useMemo, useRef, useState } from 'react';
import SongCard from './SongCard';
import { useAudioStore } from 'src/store/audio';
import AppScrollbar from './Scrollbar';
import { Message } from 'src/store/ws';
import Scrollbar from 'react-scrollbars-custom';
import QRCode from 'react-qr-code';
import { Accordion, AccordionSummary, AccordionDetails, Typography, Button } from '@mui/material';
import { styled } from '@mui/material/styles';
import { ExpandMore } from '@mui/icons-material';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { usePlayer } from 'src/hooks/player';
import TrackQueue from './TrackQueue';

const QRCodeAccordion = styled(Accordion)(({ theme }) => ({
  backgroundColor: '#2f2f2f',
  borderRadius: '12px',
  '&.Mui-expanded': {
    margin: '0px',
  },
  '& header': {
    height: 40,
  },
  '& .MuiAccordionSummary-root': {
    height: 40,
  },
  '& .MuiAccordionSummary-content': {
    margin: 0,
  },
}));

const QueueLayout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
}));

export default function Queue() {
  const joinURL = window.location.protocol + '//' + window.location.host + '/join';
  const scrollbarRef = useRef<Scrollbar | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const setSongStatus = useAudioStore((state) => state.setSongStatus);

  const { currentSong, queue, queueIdx } = usePlayer();
  const { addToQueue, getRandomTracks, rmFromQueue } = usePlayer();

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
          setSongStatus(item.data.song_id, 'ready');
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
      <div className={['p-5 font-medium text-lg h-[68px]', scrollTop > 0 ? 'shadow-xl' : ''].join(' ')}>Queue</div>
      <div className="h-full">
        <AppScrollbar className="h-full" ref={(el: Scrollbar) => (scrollbarRef.current = el)} onScroll={handleScroll}>
          <div className="px-5 mt-5 font-medium text-lg">Now playing</div>
          <div className="px-3">
            <SongCard className="mt-1" disable track={currentSong} />
          </div>

          <div className="mx-4 mt-5">
            <QRCodeAccordion sx={{ border: 0, borderRadius: 8 }} elevation={0}>
              <AccordionSummary
                expandIcon={<ExpandMore sx={{ color: 'white' }} />}
                aria-controls="panel1-content"
                id="panel1-header"
              >
                <Typography component="span" color="white">
                  Create a room
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <div className="flex justify-center m-5">
                  <div className="bg-white p-3 rounded-lg w-40 h-40">
                    <QRCode value={joinURL} className="w-full h-full" />
                  </div>
                </div>
              </AccordionDetails>
            </QRCodeAccordion>
          </div>

          <div className="px-5 mt-8 font-medium text-lg">Next from the queue</div>
          <div className="px-3">
            {tracks.length ? (
              <TrackQueue tracks={tracks} />
            ) : (
              <>
                <div className="text-gray-400 mt-2 w-full pl-2">There's no music in the queue.</div>
                <div className="mt-5 px-2 flex justify-center">
                  <Button variant="contained" onClick={getRandomTracks}>
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
