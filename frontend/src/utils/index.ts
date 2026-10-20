import { Vibrant } from 'node-vibrant/browser';
import { Track } from 'src/models/spotify';

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
export function getAvgRGB(src: string, light = false): Promise<any> {
  return new Promise((resolve) => {
    const img = new Image();
    img.setAttribute('crossOrigin', '');
    img.src = src;
    img.onload = () => {
      const vibrant = new Vibrant(img);
      vibrant.getPalette().then((palette) => {
        const swatch = palette.Vibrant;
        if (!swatch) {
          resolve(light ? DEFULT_LIGHT_COLOR : DEFAULT_COLOR);
          return;
        }
        const luminance = brightness(swatch);
        resolve(light && luminance < 0.8 ? shiftLightness(swatch, 0.8 - luminance) : swatch.hex);
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
        const base = light ? palette.LightVibrant : palette.DarkVibrant;
        if (!base) {
          resolve({ lyrics: DEFAULT_COLOR, background: DEFAULT_BG_COLOR });
          return;
        }
        const luminance = brightness(base);

        let bgColor = base.hex;
        let textColor: string;
        if (!light) {
          textColor = shiftLightness(base, 0.5);
          if (luminance < 0.2) {
            bgColor = shiftLightness(base, 0.1);
            textColor = shiftLightness(base, 0.6);
          }
        } else {
          textColor = shiftLightness(base, -0.5);
          if (luminance > 0.8) {
            bgColor = shiftLightness(base, -0.1);
            textColor = shiftLightness(base, -0.6);
          }
        }
        resolve({ lyrics: textColor, background: bgColor });
      });
    };
  });
}

export function getUniqueId(track: Track) {
  return `${track.id}-${track.timeAdded}`;
}

/** crypto.randomUUID only exists in secure contexts; a phone on http://<laptop-ip> is not one. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
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

/** Preset avatars (public/avatars), shared with KK Trip: animals, travel companions, and a funny set. */
const AVATAR_IDS = [
  'shiba', 'cat', 'panda', 'bunny', 'bear', 'owl',
  'suitcase', 'balloon', 'plane', 'train', 'camera', 'compass',
  'lemon', 'toast', 'egg', 'ghost', 'dumpling', 'potato',
];

export const PRESET_AVATARS: string[] = AVATAR_IDS.map((id) => `/avatars/${id}.svg`);

export const isLoopbackHost = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

export function getSchemesForAddress(address: string = import.meta.env.VITE_API_ADDR): {
  http: string;
  ws: string;
  address: string;
} {
  // No address configured (e.g. the Docker image): talk to whatever host served the page.
  if (!address) {
    const secure = window.location.protocol === 'https:';
    return { http: secure ? 'https://' : 'http://', ws: secure ? 'wss://' : 'ws://', address: window.location.host };
  }
  // "localhost" in the config means the machine that serves the page. Opened from another device
  // (a phone on the LAN) that machine is whatever host the page came from, not the phone itself.
  const configured = address.match(/^(localhost|127\.0\.0\.1)(:\d+)?$/);
  if (configured && !isLoopbackHost(window.location.hostname)) {
    const secure = window.location.protocol === 'https:';
    return { http: secure ? 'https://' : 'http://', ws: secure ? 'wss://' : 'ws://', address: window.location.hostname + (configured[2] ?? '') };
  }
  let host = address;
  if (host === 'localhost') {
    return { http: 'http://', ws: 'ws://', address };
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
    return { http: 'http://', ws: 'ws://', address };
  }

  if (ipv4Regex.test(host) || (host.includes(':') && ipv6Regex.test(host))) {
    return { http: 'http://', ws: 'ws://', address }; // IP → insecure
  }

  return { http: 'https://', ws: 'wss://', address }; // Hostname → secure
}
