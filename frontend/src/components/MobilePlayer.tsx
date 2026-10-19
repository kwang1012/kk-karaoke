import { Button } from 'src/components/ui/button';
import MobileAudioController from './MobileAudioController';
import AppScrollbar from './Scrollbar';
import TrackQueue from './TrackQueue';
import { useState, useRef, useMemo, useEffect } from 'react';
import { useQueue, usePlayerStore } from 'src/store/player';
import { getUniqueId } from 'src/utils';
import placeholder from 'src/assets/placeholder.png';

export default function MobilePlayer({ color }: { color?: string }) {
  const { currentTrack, queue, queueIdx } = useQueue();
  const getRandomTracks = usePlayerStore((state) => state.getRandomTracks);
  const [scrollTop, setScrollTop] = useState(0);
  const sticky = scrollTop > 0;

  const tracks = useMemo(
    () =>
      queue.slice(queueIdx + 1).map((track, index) => ({
        index,
        ...track,
        uniqueId: getUniqueId(track),
      })),
    [queue, queueIdx]
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  };
  return (
    <>
      <AppScrollbar onScroll={handleScroll} className="w-full h-full pb-5">
        <div className="w-full">{/* PUT HISTORY */}</div>
        {sticky && (
          <div
            className="fixed inset-x-0 top-0 z-[1] h-[84px] shadow-md"
            style={{
              background: color,
            }}
          />
        )}
        <div className="sticky top-0 flex items-center w-full z-50 px-6">
          <div className="w-16 h-16 rounded-md bg-[#c3c3c3] overflow-hidden">
            <img src={currentTrack?.album?.images?.[0]?.url || placeholder} className="w-full h-full" />
          </div>
          <span className="text-xl ml-2 text-white">{currentTrack?.name || 'Not Playing'}</span>
        </div>
        <div className="w-full px-6 pt-5 text-white">
          {tracks.length ? (
            <TrackQueue tracks={tracks} />
          ) : (
            <>
              <div className="text-gray-400 mt-2 w-full pl-2">There's no music in the queue.</div>
              <div className="mt-5 px-2 flex justify-center text-primary">
                <Button onClick={getRandomTracks}>
                  Random songs?
                </Button>
              </div>
            </>
          )}
        </div>
      </AppScrollbar>
      <div className="px-6">
        <MobileAudioController />
      </div>
    </>
  );
}
