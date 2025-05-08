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
    console.log(src);
    img.src = src;
    img.onload = () => {
      const colorThief = new ColorThief();
      const [r, g, b] = colorThief.getColor(img);
      resolve(rgbToHex(r, g, b));
    };
  });
}

export function getBrightestRGB(src: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', '');
    img.src = src;
    img.onload = () => {
      const colorThief = new ColorThief();
      const palette = colorThief.getPalette(img, 3);
      let max = -1;
      let index = 0;
      for (let i = 0; i < 3; i++) {
        const [r, g, b] = palette[i];
        const sum = r + g + b;
        if (sum > max) {
          max = sum;
          index = i;
        }
      }
      const [r, g, b] = palette[index];
      resolve(rgbToHex(r, g, b));
    };
  });
}
