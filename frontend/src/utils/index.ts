import { Vibrant } from 'node-vibrant/browser';
import { Track } from 'src/models/spotify';
import { colord } from 'colord';

export const DEFAULT_COLOR = '#d3d3d3';
export const DEFAULT_BG_COLOR = '#3a3a3a';
export const DEFULT_LIGHT_COLOR = '#f5bacc';
export function getAvgRGB(src: string, light = false): Promise<any> {
  return new Promise((resolve) => {
    const img = new Image();
    img.setAttribute('crossOrigin', '');
    img.src = src;
    img.onload = () => {
      const vibrant = new Vibrant(img);
      vibrant.getPalette().then((palette) => {
        let baseColor = palette.Vibrant?.hex;
        if (!baseColor) {
          resolve(light ? DEFULT_LIGHT_COLOR : DEFAULT_COLOR);
          return;
        }
        const base = colord(baseColor);
        if (light) {
          const luminance = base.brightness();
          if (luminance < 0.8) {
            baseColor = base.lighten(0.8 - luminance).toHex();
          }
        }
        resolve(baseColor);
      });
    };
  });
}

export function getLyricsRGB(src: string, light = false): Promise<any> {
  return new Promise((resolve) => {
    const img = new Image();
    img.setAttribute('crossOrigin', '');
    img.src = src;
    img.onload = () => {
      const vibrant = new Vibrant(img);
      vibrant.getPalette().then((palette) => {
        const baseColor = light ? palette.LightVibrant?.hex : palette.DarkVibrant?.hex;
        if (!baseColor) {
          resolve({ lyrics: DEFAULT_COLOR, background: DEFAULT_BG_COLOR });
          return;
        }
        // 1. Get the base color
        const base = colord(baseColor);

        // 2. Measure brightness (range: 0 = black, 1 = white)
        const luminance = base.brightness();
        // console.log('Luminance:', luminance);

        let bgColor: string = base.toHex();
        let textColor: string;
        if (!light) {
          // 3. Dynamically adjust based on luminance
          textColor = base.lighten(0.5).toHex();

          // Middle brightness → moderate adjustment
          if (luminance < 0.2) {
            bgColor = base.lighten(0.1).toHex();
            textColor = base.lighten(0.6).toHex();
          }
        } else {
          textColor = base.darken(0.5).toHex();
          if (luminance > 0.8) {
            bgColor = base.darken(0.1).toHex();
            textColor = base.darken(0.6).toHex();
          }
        }
        resolve({
          lyrics: textColor,
          background: bgColor,
        });
      });
    };
  });
}

export function getUniqueId(track: Track) {
  return `${track.id}-${track.timeAdded}`;
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (success) {
        resolve();
      } else {
        reject(new Error('Fallback: Copy command failed'));
      }
    } catch (err) {
      reject(err);
    }
  });
}

export function generateNickname() {
  const adjectives = ['Cool', 'Silly', 'Brave', 'Happy', 'Sleepy', 'Jolly', 'Swift', 'Witty', 'Funky', 'Chill'];
  const nouns = ['Panda', 'Tiger', 'Eagle', 'Otter', 'Fox', 'Koala', 'Hawk', 'Bear', 'Penguin', 'Shark'];

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(100 + Math.random() * 900); // 3-digit random number

  return `${adj}${noun}${number}`; // e.g. "HappyOtter738"
}
