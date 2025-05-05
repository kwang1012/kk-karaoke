import React, { useEffect, useRef, useState } from 'react';
import SongCard from './SongCard';
import { useAudioStore, useCurrentSong } from 'src/store/audio';
import AppScrollbar from './Scrollbar';
import { useWebSocketStore } from 'src/store/ws';
import Scrollbar from 'react-scrollbars-custom';
import QRCode from 'react-qr-code';
import { Accordion, AccordionSummary, AccordionDetails, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { ExpandMore } from '@mui/icons-material';

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

export default function Queue() {
  const currentSong = useCurrentSong();
  const queue = useAudioStore((state) => state.queue);
  const addToQueue = useAudioStore((state) => state.addToQueue);
  const queueIdx = useAudioStore((state) => state.queueIdx);
  const qMsg = useWebSocketStore((state) => state.messageQueues['queue']?.[0]);
  const songStatus = useAudioStore((state) => state.songStatus);
  const setSongStatus = useAudioStore((state) => state.setSongStatus);
  const scrollbarRef = useRef<Scrollbar | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const joinURL = window.location.protocol + '//' + window.location.host + '/join';

  useEffect(() => {
    if (qMsg) {
      if (qMsg.data.action == 'added') {
        addToQueue(qMsg.data.song);
        const scrollbar = scrollbarRef.current;
        if (scrollbar) {
          scrollbar.scrollToBottom();
        }
      } else if (qMsg.data.action == 'updated') {
        if (qMsg.data.status === 'ready') {
          setSongStatus(qMsg.data.song.id, 'ready');
        }
      }
      useWebSocketStore.getState().dequeueMessage('queue');
    }
  }, [qMsg]);

  const handleScroll = (el: Scrollbar) => {
    setScrollTop(el.scrollTop);
  };
  return (
    <div className="flex-auto h-[calc(100vh-152px)] bg-[#1f1f1f] rounded-lg mx-2 text-white max-w-[400px]">
      <div className={['p-5 font-medium text-lg tracking-wide h-[68px]', scrollTop > 0 ? 'shadow-xl' : ''].join(' ')}>
        Queue
      </div>
      <div className="h-[calc(100%-68px)]">
        <AppScrollbar className="h-full" ref={(el) => (scrollbarRef.current = el)} onScroll={handleScroll}>
          <div className="pl-5 mt-5 font-medium text-lg tracking-wide">Now playing</div>
          <div className="pl-3">
            {currentSong ? (
              <SongCard className="mt-1" song={currentSong} status={songStatus[currentSong.id]} />
            ) : (
              <div className="text-gray-400 mt-2 w-full pl-2">No song is currently playing.</div>
            )}
          </div>

          <div className="mx-5 mt-5">
            <QRCodeAccordion sx={{ border: 0, borderRadius: 8 }} elevation={0}>
              <AccordionSummary expandIcon={<ExpandMore />} aria-controls="panel1-content" id="panel1-header">
                <Typography component="span">Invite friends</Typography>
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

          <div className="pl-5 mt-8 font-medium text-lg tracking-wide">Next from the queue</div>
          <div className="pl-3">
            {queue.length - queueIdx > 1 ? (
              queue
                .slice(queueIdx + 1)
                .map((song, index) => (
                  <SongCard key={index} className="mt-1" song={song} status={songStatus[song.id]} />
                ))
            ) : (
              <div className="text-gray-400 mt-2 w-full pl-2">No more songs in the queue.</div>
            )}
          </div>
        </AppScrollbar>
      </div>
    </div>
  );
}
