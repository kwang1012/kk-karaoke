import moment from 'moment';
import ColorThief from 'colorthief';

export const format = (date: string | Date) => {
  if (typeof date === 'string') date = new Date(date);
  if (date.getMinutes()) return moment(date).format('h:m a');
  else return moment(date).format('h a');
};

export function classNames(classes: Object | Array<any>) {
  return Object.entries(classes)
    .filter(([key, value]) => value)
    .map(([key, value]) => key)
    .join(' ');
}

export function flat(array: any[]) {
  var result: any[] = [];
  array.forEach(function (a) {
    result.push(a);
    if (Array.isArray(a.children)) {
      result = result.concat(flat(a.children));
    }
  });
  return result;
}

export function normalize(data: any) {
  const isObject = (data: any) => Object.prototype.toString.call(data) === '[object Object]';
  const isArray = (data: any) => Object.prototype.toString.call(data) === '[object Array]';

  const flatten = (data: any) => {
    if (!data.attributes) return data;

    return {
      id: data.id ? data.id : null,
      ...data.attributes,
    };
  };

  if (isArray(data)) {
    return data.map((item: any) => normalize(item));
  }

  if (isObject(data)) {
    if (isArray(data.data)) {
      data = [...data.data];
    } else if (isObject(data.data)) {
      data = flatten({ ...data.data });
    } else if (data.data === null) {
      data = null;
    } else {
      data = flatten(data);
    }

    for (const key in data) {
      data[key] = normalize(data[key]);
    }

    return data;
  }

  return data;
}

function componentToHex(c: number) {
  var hex = c.toString(16);
  return hex.length == 1 ? '0' + hex : hex;
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

export function getAvgRGB(src: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', '');
    img.src = src;
    img.onload = () => {
      const colorThief = new ColorThief();
      const [r, g, b] = colorThief.getColor(img);
      resolve(rgbToHex(r, g, b));
    };
  });
}

export function getLyricsRGB(src: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', '');
    img.src = src;
    img.onload = () => {
      const colorThief = new ColorThief();
      const palette = colorThief.getPalette(img, 6);
      let min = 755;
      let index = -1;
      for (let i = 0; i < 3; i++) {
        const [r, g, b] = palette[i];
        const sum = r + g + b;
        if (sum < 180) continue;
        if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && Math.abs(b - r) < 20) continue;
        if (sum < min) {
          min = sum;
          index = i;
        }
      }
      let color: number[] = [];
      if (!palette[index]) {
        color = [183, 183, 183];
      } else {
        color = palette[index];
      }
      const offset = 100;
      if (color[0] > 100 || color[1] > 100 || color[2] > 100) {
        var [r, g, b] = color.map((c: number) => Math.max(0, c - offset));
      } else {
        var [r, g, b] = color;
      }
      const [r2, g2, b2] = color.map((c: number) => Math.min(222, c + offset));
      resolve({
        lyrics: rgbToHex(r2, g2, b2),
        background: rgbToHex(r, g, b),
      });
    };
  });
}
