import { useEffect, useState } from 'react';
import { DEFAULT_LYRICS_COLORS, getLyricsRGB, type LyricsColors } from 'src/utils/coverColors';

/** Only the current cover and theme may update the lyrics palette. */
export function useLyricsColors(image: string | undefined, light = false): LyricsColors {
  const [result, setResult] = useState<{ image: string; light: boolean; colors: LyricsColors }>();
  useEffect(() => {
    if (!image) return;
    let active = true;
    getLyricsRGB(image, light).then((colors) => {
      if (active) setResult({ image, light, colors });
    });
    return () => { active = false; };
  }, [image, light]);
  return result?.image === image && result?.light === light ? result.colors : DEFAULT_LYRICS_COLORS;
}
