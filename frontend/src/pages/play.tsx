import MobileAudioController from 'src/components/MobielAudioController';
import { styled } from '@mui/material/styles';
import { usePlayer } from 'src/hooks/player';
import placeholder from 'src/assets/placeholder.png';
import SongCard from 'src/components/SongCard';
import Skeleton from 'react-loading-skeleton';
import Scrollbar from 'react-scrollbars-custom';
import AppScrollbar from 'src/components/Scrollbar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@mui/material';

const Layout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: '1fr auto',
  gridTemplateColumns: '1fr',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: '100%',
  padding: 24,
  paddingTop: 10,
  backgroundImage: 'linear-gradient(to bottom, #CC3363, #CC336340, #CC336310)',
}));

const Overlay = styled('div')(({ theme }) => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  height: 84,
  zIndex: 1,
  background: 'linear-gradient(#cc3363, #C63260)',
  boxShadow: '0px 4px 24px rgba(0, 0, 0, 0.25)',
}));
export default function PlayView() {
  const { currentSong, queue, queueIdx } = usePlayer();
  const { rmSongFromQueue, fetchDefaultTracks } = usePlayer();
  const [scrollTop, setScrollTop] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const sticky = useMemo(() => {
    if (!ref.current) return false;
    const { top } = ref.current.getBoundingClientRect();
    if (top > 10) return false;
    return true;
  }, [scrollTop]);
  return (
    <Layout>
      <div className="flex flex-col items-center h-full relative pb-5">
        <AppScrollbar onScroll={({ scrollTop }) => setScrollTop(scrollTop)} className="w-full h-full">
          <div className="w-full">{/* PUT HISTORY */}</div>
          {sticky && <Overlay />}
          <div ref={ref} className="sticky top-0 flex items-center w-full z-50">
            <div className="w-16 h-16 rounded-md bg-[#c3c3c3] overflow-hidden">
              <img src={currentSong?.album?.image || placeholder} className="w-full h-full" />
            </div>
            <span className="text-xl ml-2">{currentSong?.name || 'Not Playing'}</span>
          </div>
          <div className="w-full h-screen">
            {queue.length - queueIdx > 1 ? (
              queue
                .slice(queueIdx + 1)
                .map((song, index) => <SongCard key={index} className="mt-1" song={song} onDelete={rmSongFromQueue} />)
            ) : (
              <>
                <div className="text-[white] mt-5 w-full text-center">No more songs in the queue.</div>
                <div className="mt-5 px-2 flex justify-center">
                  <Button variant="contained" onClick={() => fetchDefaultTracks()}>
                    Random songs?
                  </Button>
                </div>
              </>
            )}
          </div>
        </AppScrollbar>
      </div>
      <MobileAudioController />
    </Layout>
  );
}
