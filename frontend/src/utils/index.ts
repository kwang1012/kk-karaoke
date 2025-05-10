import moment from 'moment';
import { Vibrant } from 'node-vibrant/browser';

export const format = (date: string | Date) => {
  if (typeof date === 'string') date = new Date(date);
  if (date.getMinutes()) return moment(date).format('h:m a');
  else return moment(date).format('h a');
};

export function getAvgRGB(src: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', '');
    img.src = src;
    img.onload = () => {
      const vibrant = new Vibrant(img);
      vibrant.getPalette().then((palatte) => {
        const color = palatte.Vibrant?.hex;
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
      vibrant.getPalette().then((palatte) => {
        const lyricsColor = palatte.LightVibrant?.hex;
        const color = palatte.DarkVibrant?.hex;
        resolve({
          lyrics: lyricsColor,
          background: color,
        });
      });
    };
  });
}
