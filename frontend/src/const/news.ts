import moment from 'moment';

const news = [
  {
    title: "One paper is accepted to **CLOSER'23**",
    highlighted: false,
    date: '02/032023',
  },
  {
    title: 'Graduated from National Tsing Hua University!!',
    highlighted: false,
    date: '01/18/2023',
  },
  {
    title: 'New Paper accepted at **PDCAT 2022**!',
    highlighted: false,
    date: '10/23/2022',
  },
  {
    title: "Attend the conference, **PDCAT'22** (Sendai, Japan)",
    highlighted: false,
    date: '12/7/2022',
  },
  {
    title: 'Joined CS PhD @ **University of Illinois Urbana-Champaign**!',
    highlighted: false,
    date: '8/16/2023',
  },
];
export function getNews(sort?: string) {
  let _news = news;
  if (sort) {
    const asc = sort === 'asc' ? 1 : -1;
    _news = _news.sort((a, b) =>
      moment(a.date, 'MM/DD/YYYY').isBefore(moment(b.date, 'MM/DD/YYYY')) ? -1 * asc : 1 * asc
    );
  }
  return _news;
}
