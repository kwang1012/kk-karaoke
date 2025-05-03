import moment from 'moment';

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
