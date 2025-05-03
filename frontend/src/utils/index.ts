import moment from 'moment';
import axios from 'axios';

export const format = (date: string | Date) => {
  if (typeof date === 'string') date = new Date(date);
  if (date.getMinutes()) return moment(date).format('h:m a');
  else return moment(date).format('h a');
};

export function onClickProvider(provider: string, setting: any) {
  switch (provider) {
    case 'facebook':
      window.open('https://www.facebook.com/kwang871012', '_blank');
      break;
    case 'instagram':
      window.open('https://www.instagram.com/kwang871012', '_blank');
      break;
    case 'x-twitter':
      window.open('https://twitter.com/kwang871012', '_blank');
      break;
    case 'google-scholar':
      window.open('https://scholar.google.com/citations?hl=en&user=h_G1PyIAAAAJ', '_blank');
      break;
    case 'linkedin':
      window.open('https://www.linkedin.com/in/kai-wang-1b57b51a8/', '_blank');
      break;
    default: {
      if (provider.includes('cv')) window.open('/CV.pdf', '_blank');
      else if (provider.includes('google-scholar'))
        window.open('https://scholar.google.com/citations?hl=en&user=h_G1PyIAAAAJ', '_blank');
      else if (provider.includes('github')) window.open('https://github.com/kwang1012', '_blank');
      else if (provider.includes('x-twitter')) window.open('https://twitter.com/kwang871012', '_blank');
      else if (provider.includes('linkedin')) window.open('https://www.linkedin.com/in/kai-wang-1b57b51a8/', '_blank');
    }
  }
}

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

export async function getEvents(preview = false) {
  const today = new Date();
  return await axios
    .get('https://calendar-niraywahjq-uc.a.run.app', {
      params: {
        year: today.getFullYear(),
        month: today.getMonth() + 1,
      },
    })
    .then(({ data }) => {
      const events: any = {};
      for (const evt of data) {
        const date = evt.start.dateTime || evt.start.date.replace(/-/g, '/');
        const dateTime = new Date(date);
        const year = dateTime.getFullYear();
        const month = dateTime.getMonth() + 1;
        const day = dateTime.getDate();
        if (!events[year]) events[year] = {};
        if (!events[year][month]) events[year][month] = {};
        if (preview) {
          if (!events[year][month][day]) events[year][month][day] = true;
        } else {
          if (!events[year][month][day]) events[year][month][day] = [evt];
          else {
            const exist = events[year][month][day].find((event: any) => event.id === evt.id);
            if (!exist) events[year][month][day].push(evt);
          }
        }
      }
      return events;
    })
    .catch(() => []);
}
