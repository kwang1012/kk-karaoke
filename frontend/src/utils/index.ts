import { Track } from 'src/models/spotify';
import { getBackendAddress } from './backend';
export { DEFAULT_COLOR, DEFAULT_BG_COLOR, DEFULT_LIGHT_COLOR, getAvgRGB, getLyricsRGB } from './coverColors';

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

export function getSchemesForAddress(address: string | undefined = getBackendAddress()): {
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
