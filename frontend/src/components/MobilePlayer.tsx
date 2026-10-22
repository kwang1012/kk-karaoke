import { Button } from 'src/components/ui/button';
import MobileAudioController from './MobileAudioController';
import AppScrollbar from './Scrollbar';
import TrackQueue from './TrackQueue';
import QueueOrderControls from './QueueOrderControls';
import { useState, useRef, useMemo, useEffect } from 'react';
import { useQueue, usePlayerStore } from 'src/store/player';
import { getUniqueId } from 'src/utils';
import placeholder from 'src/assets/placeholder.png';
import { useT } from 'src/i18n';

export default function MobilePlayer({ color }: { color?: string }) {
  const t = useT();
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
            <img referrerPolicy="no-referrer" src={currentTrack?.album?.images?.[0]?.url || placeholder} className="w-full h-full" />
          </div>
          <span className="text-xl ml-2 text-white">{currentTrack?.name || t('common.notPlaying')}</span>
        </div>
        <div className="w-full px-6 pt-5 text-white">
          {tracks.length > 0 && (
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t('queue.nextUp')}</h2>
              <QueueOrderControls />
            </div>
          )}
          {tracks.length ? (
            <TrackQueue tracks={tracks} />
          ) : (
            <>
              <div className="mt-2 w-full pl-2 text-gray-400">{t('queue.empty')}</div>
              <div className="mt-5 px-2 flex justify-center text-primary">
                <Button onClick={getRandomTracks}>
                  {t('queue.random')}
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
