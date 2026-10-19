import MobileLyrics from 'src/components/MobileLyrics';
import { useThemeMode } from 'src/hooks/theme';
import MobileAudioController from 'src/components/MobileAudioController';
import { useState, useEffect } from 'react';
import { DEFAULT_COLOR, DEFAULT_BG_COLOR, getLyricsRGB } from 'src/utils';
import { usePlayer } from 'src/store/player';

export default function MobileLyricsView() {
  const { currentTrack } = usePlayer();
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG_COLOR);
  const mode = useThemeMode();
  const image = currentTrack?.album?.images?.[0]?.url;

  useEffect(() => {
    if (!image) {
      setColor(DEFAULT_COLOR);
      setBgColor(DEFAULT_BG_COLOR);
      return;
    }
    getLyricsRGB(image, mode === 'light')
      .then(({ lyrics, background }) => {
        setColor(lyrics);
        setBgColor(background);
      })
      .catch((error) => {
        console.error('Error fetching average RGB:', error);
      });
  }, [image, mode]);
  return (
    <div className="grid h-full w-full grid-cols-1 grid-rows-[1fr_auto] items-center justify-center overflow-hidden" style={{ backgroundColor: bgColor }}>
      <MobileLyrics color={color} bgColor={bgColor} />
      <div className="px-6 pb-3">
        <MobileAudioController />
      </div>
    </div>
  );
}
