import MobileAudioController from 'src/components/MobielAudioController';
import { styled } from '@mui/material/styles';
import { usePlayerStore, useQueue } from 'src/store/player';
import placeholder from 'src/assets/placeholder.png';
import AppScrollbar from 'src/components/Scrollbar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, useMediaQuery } from '@mui/material';
import { DEFAULT_BG_COLOR, getAvgRGB, getUniqueId } from 'src/utils';
import TrackQueue from 'src/components/TrackQueue';
import { useNavigate } from 'react-router-dom';
import MobilePlayer from 'src/components/MobilePlayer';

const Layout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: '1fr auto',
  gridTemplateColumns: '1fr',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  paddingTop: 10,
  paddingBottom: 10,
  overflow: 'hidden',
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
  const { currentSong } = useQueue();
  const [color, setColor] = useState<string>(DEFAULT_BG_COLOR);
  const image = currentSong?.album?.images?.[0]?.url;
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const navigate = useNavigate();

  useEffect(() => {
    if (!image) {
      setColor(DEFAULT_BG_COLOR);
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

  useEffect(() => {
    if (!mobile) navigate('/', { replace: true });
  }, [mobile]);

  function setThemeColor(color: string) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', color);
  }

  useEffect(() => {
    setThemeColor(color);
  }, [color]);
  return (
    <Layout
      style={{
        backgroundImage: `linear-gradient(to bottom, ${color} 84px, ${color}40, #121212)`,
      }}
    >
      <MobilePlayer />
    </Layout>
  );
}
