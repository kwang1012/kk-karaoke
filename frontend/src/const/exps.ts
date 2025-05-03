import moment from 'moment';

const rExps = [
  {
    title: 'DPRG Research Group',
    link: 'https://dprg.cs.uiuc.edu/',
    corp: 'UIUC',
    place: 'Urbana, IL, USA',
    position: 'Graduate Research Assistant',
    startDate: '8/16/2023',
    advisor: 'Prof. Indranil Gupta',
    projects: ['Smart Home'],
  },
  {
    title: 'LSA Lab',
    link: 'https://lsalab.cs.nthu.edu.tw',
    corp: 'National Tsing Hua University',
    place: 'Hsichu, Taiwan',
    position: 'Graduate Research Assistant',
    startDate: '3/1/2021',
    endDate: '1/31/2023',
    advisor: 'Prof. Jerry Chou',
    projects: ['Scheduling in embedded systems with memory constraints', 'Big Data', 'Cloud computing'],
  },
  {
    title: 'HSCC Lab',
    link: 'http://hscc.cs.nthu.edu.tw/2011newpage/sh1-1.htm',
    corp: 'National Tsing Hua University',
    place: 'Hsichu, Taiwan',
    position: 'Undergraduate Research Assistant',
    startDate: '9/1/2020',
    endDate: '1/31/2021',
    advisor: 'Prof. Jang-Ping Sheu',
    projects: ['CNN Parallelization with Raspberry PI'],
  },
  {
    title: 'Skymizer',
    link: 'https://skymizer.com/',
    place: 'Taipei, Taiwan',
    position: 'System Architect',
    startDate: '5/1/2021',
    endDate: '3/10/2023',
    projects: ['Forest Runtime', 'Pipeline Parallelism for Deep Learning'],
  },
];

const tExps = [
  {
    title: 'Computer Science Department',
    corp: 'University of Illinois Urbana-Champaign',
    place: 'Urbana, IL, USA',
    position: 'Graduate Teaching Assistant',
    startDate: 'Fall 2024',
    projects: ['CS425 Distributed Systems'],
  },
  {
    title: 'Computer Science Department',
    corp: ' National Tsing Hua University',
    place: 'Hsinchu, Taiwan',
    position: 'Graduate Teaching Assistant',
    startDate: 'Fall 2022',
    projects: ['CS542200 Parallel Programming'],
  },
]

export function getRExps(sort?: string) {
  let _exps = rExps;
  if (sort) {
    const asc = sort === 'asc' ? 1 : -1;
    _exps = _exps.sort((a, b) =>
      moment(a.startDate, 'MM/DD/YYYY').isBefore(moment(b.startDate, 'MM/DD/YYYY')) ? -1 * asc : 1 * asc
    );
  }
  return _exps;
}

export function getTExps(sort?: string) {
  let _exps = tExps;
  if (sort) {
    const asc = sort === 'asc' ? 1 : -1;
    _exps = _exps.sort((a, b) =>
      moment(a.startDate, 'MM/DD/YYYY').isBefore(moment(b.startDate, 'MM/DD/YYYY')) ? -1 * asc : 1 * asc
    );
  }
  return _exps;
}
