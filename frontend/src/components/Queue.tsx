import React from 'react';
import SongCard from './SongCard';
import { useAudioStore, useCurrentSong } from 'src/store/audio';

export default function Queue() {
  const currentSong = useCurrentSong();
  const queue = useAudioStore((state) => state.queue);
  const queueIdx = useAudioStore((state) => state.queueIdx);
  return (
    <div className="flex-auto h-[calc(100vh-152px)] bg-[#1f1f1f] rounded-lg mx-2 p-3 text-white">
      <div className="pl-2 pb-5 pt-2 font-medium text-lg tracking-widest">Queue</div>
      <div className="pl-2 mt-5 font-medium text-lg tracking-widest">Now playing</div>
      <div>
        {currentSong ? (
          <SongCard className="mt-1" song={currentSong} />
        ) : (
          <div className="text-gray-400 mt-2 w-full pl-2">No song is currently playing.</div>
        )}
      </div>
      <div className="pl-2 mt-8 font-medium text-lg tracking-widest">Next from the queue</div>
      <div>
        {queue.length - queueIdx > 1 ? (
          queue.slice(queueIdx + 1).map((song, index) => <SongCard key={song.id} className="mt-1" song={song} />)
        ) : (
          <div className="text-gray-400 mt-2 w-full pl-2">No more songs in the queue.</div>
        )}
      </div>
    </div>
  );
}
