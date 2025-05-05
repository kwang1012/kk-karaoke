import React, { useEffect, useRef } from 'react';
import SongCard from './SongCard';
import { useAudioStore, useCurrentSong } from 'src/store/audio';
import AppScrollbar from './Scrollbar';
import { useWebSocketStore } from 'src/store/ws';

export default function Queue() {
  const currentSong = useCurrentSong();
  const queue = useAudioStore((state) => state.queue);
  const addToQueue = useAudioStore((state) => state.addToQueue);
  const queueIdx = useAudioStore((state) => state.queueIdx);
  const qMsg = useWebSocketStore((state) => state.messageQueues['queue']?.[0]);

  useEffect(() => {
    if (qMsg) {
      console.log('Processing queue message:', qMsg);
      if (qMsg.data.action == 'added') {
        addToQueue(qMsg.data.song);
      }
      useWebSocketStore.getState().dequeueMessage('queue');
    }
  }, [qMsg]);

  return (
    <div className="flex-auto h-[calc(100vh-152px)] bg-[#1f1f1f] rounded-lg mx-2 text-white max-w-[400px]">
      <div className="p-5 font-medium text-lg tracking-widest h-[68px]">Queue</div>
      <div className="h-[calc(100%-68px)]">
        <AppScrollbar className="h-full">
          <div className="pl-5 mt-5 font-medium text-lg tracking-widest">Now playing</div>
          <div className="pl-3">
            {currentSong ? (
              <SongCard className="mt-1" song={currentSong} />
            ) : (
              <div className="text-gray-400 mt-2 w-full pl-2">No song is currently playing.</div>
            )}
          </div>
          <div className="pl-5 mt-8 font-medium text-lg tracking-widest">Next from the queue</div>
          <div className="pl-3">
            {queue.length - queueIdx > 1 ? (
              queue.slice(queueIdx + 1).map((song, index) => <SongCard key={song.id} className="mt-1" song={song} />)
            ) : (
              <div className="text-gray-400 mt-2 w-full pl-2">No more songs in the queue.</div>
            )}
          </div>
        </AppScrollbar>
      </div>
    </div>
  );
}
