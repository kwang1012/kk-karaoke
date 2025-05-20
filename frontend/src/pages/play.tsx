import { styled } from '@mui/material/styles';
import { useQueue } from 'src/store/player';
import { useEffect, useState } from 'react';
import { useMediaQuery } from '@mui/material';
import { DEFAULT_BG_COLOR, getAvgRGB } from 'src/utils';
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
  paddingTop: 12,
  paddingBottom: 12,
  overflow: 'hidden',
}));

export default function PlayView() {
  const { currentTrack } = useQueue();
  const [color, setColor] = useState<string>(DEFAULT_BG_COLOR);
  const image = currentTrack?.album?.images?.[0]?.url;
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const navigate = useNavigate();

  useEffect(() => {
    if (!image) {
      setColor(DEFAULT_BG_COLOR);
      setThemeColor(DEFAULT_BG_COLOR);
      return;
    }
    getAvgRGB(image)
      .then((data) => {
        setColor(data);
        setThemeColor(data);
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
  return (
    <Layout
      style={{
        backgroundImage: `linear-gradient(to bottom, ${color} 84px, ${color}40, #121212)`,
      }}
    >
      <MobilePlayer color={color} />
    </Layout>
  );
}
