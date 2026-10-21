import { Vibrant } from 'node-vibrant/browser';

type Swatch = NonNullable<Awaited<ReturnType<Vibrant['getPalette']>>['Vibrant']>;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Swatch -> '#rrggbb' after shifting its HSL lightness by `delta` (-1..1). */
function shiftLightness(swatch: Swatch, delta = 0): string {
  const [h, s, l0] = swatch.hsl;
  const l = clamp01(l0 + delta);
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Perceived brightness, 0 (black) to 1 (white). */
const brightness = ({ rgb: [r, g, b] }: Swatch) => (r * 299 + g * 587 + b * 114) / 1000 / 255;

export const DEFAULT_COLOR = '#d3d3d3';
export const DEFAULT_BG_COLOR = '#3a3a3a';
export const DEFULT_LIGHT_COLOR = '#f5bacc';
/** Match cover <img> requests while allowing canvas color extraction. */
async function getCoverPalette(src: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load song cover'));
    img.src = src;
  });
  return new Vibrant(image).getPalette();
}

export async function getAvgRGB(src: string, light = false): Promise<string> {
  const fallback = light ? DEFULT_LIGHT_COLOR : DEFAULT_COLOR;
  try {
    const palette = await getCoverPalette(src);
    const swatch = palette.Vibrant ?? palette.Muted ?? palette.DarkVibrant ?? palette.DarkMuted;
    if (!swatch) return fallback;
    const luminance = brightness(swatch);
    return light && luminance < 0.8 ? shiftLightness(swatch, 0.8 - luminance) : swatch.hex;
  } catch {
    return fallback;
  }
}

export type LyricsColors = { lyrics: string; background: string };
export const DEFAULT_LYRICS_COLORS: LyricsColors = { lyrics: DEFAULT_COLOR, background: DEFAULT_BG_COLOR };

export async function getLyricsRGB(src: string, light = false): Promise<LyricsColors> {
  try {
    const palette = await getCoverPalette(src);
    // Use the cover's dominant real swatch, not a synthesized vibrant accent
    // (a small logo can otherwise color an otherwise neutral album cover).
    const base = Object.values(palette)
      .filter((swatch): swatch is Swatch => !!swatch && swatch.population > 0)
      .sort((a, b) => b.population - a.population)[0];
    if (!base) return DEFAULT_LYRICS_COLORS;
    const lightness = light
      ? Math.min(0.85, Math.max(0.75, base.hsl[2]))
      : Math.min(0.32, Math.max(0.16, base.hsl[2]));
    const background = shiftLightness(base, lightness - base.hsl[2]);
    const lyrics = shiftLightness(base, (light ? 0.12 : 0.92) - base.hsl[2]);
    return { lyrics, background };
  } catch {
    return DEFAULT_LYRICS_COLORS;
  }
}

