import MobileAudioController from 'src/components/MobielAudioController';
import { styled } from '@mui/material/styles';
import { usePlayerStore, useQueue } from 'src/store/player';
import placeholder from 'src/assets/placeholder.png';
import AppScrollbar from 'src/components/Scrollbar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@mui/material';
import { getAvgRGB, getUniqueId } from 'src/utils';
import TrackQueue from 'src/components/TrackQueue';

const Layout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: '1fr auto',
  gridTemplateColumns: '1fr',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: '100%',
  paddingTop: 10,
  paddingBottom: 10,
}));

const Overlay = styled('div')(({ theme }) => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  height: 84,
  zIndex: 1,
}));
export default function PlayView() {
  const { currentSong, queue, queueIdx } = useQueue();
  const getRandomTracks = usePlayerStore((state) => state.getRandomTracks);
  const [scrollTop, setScrollTop] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const sticky = useMemo(() => {
    if (!ref.current) return false;
    const { top } = ref.current.getBoundingClientRect();
    if (top > 10) return false;
    return true;
  }, [scrollTop]);
  useEffect(() => {
    window.scrollTo(0, 1);
  }, []);
  const [color, setColor] = useState<string>('#535353');
  const image = currentSong?.album?.images?.[0]?.url;

  const tracks = useMemo(() => {
    return queue.slice(queueIdx + 1).map((track, index) => ({
      index,
      ...track,
      uniqueId: getUniqueId(track),
    }));
  }, [queue, queueIdx]);
  useEffect(() => {
    if (!image) {
      setColor('#535353');
      return;
    }
    getAvgRGB(image)
      .then((data) => {
        setColor(data);
      })
      .catch((error) => {
        console.error('Error fetching average RGB:', error);
      });
  }, [image]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  };
  return (
    <Layout
      style={{
        backgroundImage: `linear-gradient(to bottom, ${color} 84px, ${color}40, #121212)`,
      }}
    >
      <div className="flex flex-col items-center h-full relative pb-5">
        <AppScrollbar onScroll={handleScroll} className="w-full h-full">
          <div className="w-full">{/* PUT HISTORY */}</div>
          {sticky && (
            <Overlay
              className="shadow-md"
              style={{
                background: color,
              }}
            />
          )}
          <div ref={ref} className="sticky top-0 flex items-center w-full z-50 px-6">
            <div className="w-16 h-16 rounded-md bg-[#c3c3c3] overflow-hidden">
              <img src={currentSong?.album?.images?.[0]?.url || placeholder} className="w-full h-full" />
            </div>
            <span className="text-xl ml-2 text-white">{currentSong?.name || 'Not Playing'}</span>
          </div>
          <div className="w-full px-6 pt-5 text-white">
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
      </div>
      <div className="px-6">
        <MobileAudioController />
      </div>
    </Layout>
  );
}
