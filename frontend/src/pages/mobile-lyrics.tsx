import MobileLyrics from 'src/components/MobileLyrics';
import { styled, useTheme } from '@mui/material/styles';
import MobileAudioController from 'src/components/MobileAudioController';
import { useState, useEffect } from 'react';
import { DEFAULT_COLOR, DEFAULT_BG_COLOR, getLyricsRGB } from 'src/utils';
import { usePlayer } from 'src/store/player';

const Layout = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: '1fr auto',
  gridTemplateColumns: '1fr',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
}));

export default function MobileLyricsView() {
  const { currentSong } = usePlayer();
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG_COLOR);
  const theme = useTheme();
  const image = currentSong?.album?.images?.[0]?.url;

  useEffect(() => {
    if (!image) {
      setColor(DEFAULT_COLOR);
      setBgColor(DEFAULT_BG_COLOR);
      return;
    }
    getLyricsRGB(image, theme.palette.mode === 'light')
      .then(({ lyrics, background }) => {
        setColor(lyrics);
        setBgColor(background);
      })
      .catch((error) => {
        console.error('Error fetching average RGB:', error);
      });
  }, [image, theme.palette.mode]);
  return (
    <Layout style={{ backgroundColor: bgColor }}>
      <MobileLyrics color={color} bgColor={bgColor} />
      <div className="px-6 pb-3">
        <MobileAudioController />
      </div>
    </Layout>
  );
}
