import { Vibrant } from 'node-vibrant/browser';
import { Track } from 'src/models/spotify';
import { colord } from 'colord';
import { adventurer } from '@dicebear/collection';
import { createAvatar } from '@dicebear/core';

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

export function generateAvatars(count: number = 10): string[] {
  const avatars: string[] = [];
  for (let i = 0; i < count; i++) {
    const avatar = createAvatar(adventurer, {
      seed: Math.random().toString(36).substring(2, 15), // Random seed for each avatar
      // ... other options
    });
    avatars.push(avatar.toDataUri());
  }
  return avatars;
}

export function getSchemesForAddress(address: string) {
  let host = address;
  if (host === 'localhost') {
    return { http: 'http://', ws: 'ws://' };
  }
  if (address.startsWith('[')) {
    host = address.slice(1, address.indexOf(']'));
  } else if (address.includes(':')) {
    host = address.split(':')[0];
  }

  const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const ipv6Regex = /^[0-9a-fA-F:]+$/;

  // Special case for localhost
  if (host === 'localhost') {
    return { http: 'http://', ws: 'ws://' };
  }

  if (ipv4Regex.test(host) || (host.includes(':') && ipv6Regex.test(host))) {
    return { http: 'http://', ws: 'ws://' }; // IP → insecure
  }

  return { http: 'https://', ws: 'wss://' }; // Hostname → secure
}
