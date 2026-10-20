import MobileLyrics from 'src/components/MobileLyrics';
import { useThemeMode } from 'src/hooks/theme';
import MobileAudioController from 'src/components/MobileAudioController';
import { useState, useEffect } from 'react';
import { DEFAULT_COLOR, DEFAULT_BG_COLOR, getLyricsRGB } from 'src/utils';
import { usePlayer } from 'src/store/player';
import LyricsOffset from 'src/components/LyricsOffset';
import { useLyricsOffset } from 'src/hooks/lyricsOffset';

export default function MobileLyricsView() {
  const { currentTrack } = usePlayer();
  const { ahead, setAhead, approximate, videoUrl, disabled } = useLyricsOffset();
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
      <div className="relative h-full min-h-0">
        <MobileLyrics color={color} bgColor={bgColor} />
        {!disabled && (
          <div className="absolute right-3 bottom-3 z-10">
            <LyricsOffset value={ahead} onChange={setAhead} approximate={approximate} videoUrl={videoUrl} />
          </div>
        )}
      </div>
      <div className="px-6 pb-3">
        <MobileAudioController />
      </div>
    </div>
  );
}
