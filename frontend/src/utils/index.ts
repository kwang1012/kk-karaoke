import { Vibrant } from 'node-vibrant/browser';
import { Track } from 'src/models/spotify';

export const DEFAULT_COLOR = '#d3d3d3';
export const DEFAULT_BG_COLOR = '#3a3a3a';
export function getAvgRGB(src: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', '');
    img.src = src;
    img.onload = () => {
      const vibrant = new Vibrant(img);
      vibrant.getPalette().then((palette) => {
        const color = palette.Vibrant?.hex || DEFAULT_BG_COLOR;
        resolve(color);
      });
    };
  });
}

export function getLyricsRGB(src: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', '');
    img.src = src;
    img.onload = () => {
      const vibrant = new Vibrant(img);
      vibrant.getPalette().then((palette) => {
        const lyricsColor = palette.LightVibrant?.hex || DEFAULT_COLOR;
        const color = palette.DarkVibrant?.hex || DEFAULT_BG_COLOR;
        resolve({
          lyrics: lyricsColor,
          background: color,
        });
      });
    };
  });
}

export function getUniqueId(track: Track) {
  return track.id.toString() + track.timeAdded.toString();
}
