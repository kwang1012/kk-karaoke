import moment from 'moment';

const pubs = [
  {
    title: 'A Reservation-Based List Scheduling for Embedded Systems with Memory Constraints',
    authorList: [
      {
        name: 'Kai-Siang Wang',
        type: 'First Author',
      },
      {
        name: 'Jerry Chou',
        type: 'Advisor',
      },
    ],
    venue: {
      url: 'https://www.hpc.is.tohoku.ac.jp/pdcat2022/',
      name: 'The 23rd International Conference on Parallel and Distributed Computing, Applications and Technologies',
      short: "PDCAT'22",
      status: '',
    },
    url: 'https://link.springer.com/chapter/10.1007/978-3-031-29927-8_12',
    abstract:
      'Many embedded systems have hard resource constraints that make schedules found by list scheduling heuristics invalid. In this paper, we show the problems caused by memory constraints and deadlocks during the scheduling process. We propose new extensions for list scheduling algorithms and make them take memory constraints into account. The experiment shows that our methods can solve deadlocks effectively and reduce total memory usage drastically compared to original scheduling heuristics.',
    image: '/reservation.webp',
    slides: 'https://lsalab.cs.nthu.edu.tw/home/publication/PDCAT22_slides.pptx',
    bib: `@InProceedings{10.1007/978-3-031-29927-8_12,
author="Wang, Kai-Siang
and Chou, Jerry",
editor="Takizawa, Hiroyuki
and Shen, Hong
and Hanawa, Toshihiro
and Hyuk Park, Jong
and Tian, Hui
and Egawa, Ryusuke",
title="A Reservation-Based List Scheduling for Embedded Systems with Memory Constraints",
booktitle="Parallel and Distributed Computing, Applications and Technologies",
year="2023",
publisher="Springer Nature Switzerland",
address="Cham",
pages="147--157",
isbn="978-3-031-29927-8"
}`,
    date: '12/7/2022',
    selected: true,
  },
  {
    title:
      'ALBERT: An automatic learning based execution and resource management system for optimizing Hadoop workload in clouds',
    authorList: [
      {
        name: 'Chen-Chun Chen',
        type: 'First Author',
      },
      {
        name: 'Kai-Siang Wang',
        type: 'Co',
      },
      {
        name: 'Yu-Tung Hsiao',
        type: 'Co',
      },
      {
        name: 'Jerry Chou',
        type: 'Advisor',
      },
    ],
    venue: {
      name: 'Journal of Parallel and Distributed Computing',
      short: "JPDC'22",
    },
    url: 'https://www.sciencedirect.com/science/article/pii/S0743731522001289',
    abstract:
      'Hadoop is a popular computing framework designed to deliver timely and cost-effective data processing on a large cluster of commodity machines. It relieves the burden of the programmers dealing with distributed programming, and an ecosystem of Big Data solutions has developed around it. However, Hadoop’s job execution time can greatly depend on its runtime configurations and resource selections. Given the more than 100 job configuration settings provided by Hadoop, and diverse resource instance options in a cloud or virtualized computing environment, running Hadoop jobs still requires a substantial amount of expertise and experience. To address this challenge, we apply a deep neural network to predict Hadoop’s job time based on historical execution data, and propose optimization methods to reduce job execution time and cost. The results show that our prediction method achieves almost 90% time prediction accuracy and clearly outperforms three other state-of-the-art regression-based prediction methods. Based on the time prediction, our proposed configuration search method and job scheduling algorithm successfully shorten the execution time of a single Hadoop job by more than a factor of 2 and reduce the time of processing a batch of Hadoop jobs by 40% ~65%.',
    image: '/hadoop.webp',
    bib: `@article{CHEN202245,
title = {ALBERT: An automatic learning based execution and resource management system for optimizing Hadoop workload in clouds},
journal = {Journal of Parallel and Distributed Computing},
volume = {168},
pages = {45-56},
year = {2022},
issn = {0743-7315},
doi = {https://doi.org/10.1016/j.jpdc.2022.05.013},
author = {Chen-Chun Chen and Kai-Siang Wang and Yu-Tung Hsiao and Jerry Chou},
}`,
    date: '6/1/2022',
    selected: false,
  },
  {
    title: 'Optimal Static Bidding Strategy for Running Batch Jobs with Hard Deadline Constraints on Spot Instances',
    authorList: [
      {
        name: 'Kai-Siang Wang',
        type: 'First Author',
      },
      {
        name: 'Cheng-Han Hsieh',
        type: 'Co',
      },
      {
        name: 'Jerry Chou',
        type: 'Advisor',
      },
    ],
    venue: {
      name: 'The International Conference on Cloud Computing and Services Science, 2023',
      short: "CLOSER'23",
      status: '',
    },
    url: 'https://www.scitepress.org/PublicationsDetail.aspx?ID=Ajk01eQ6KJU=&t=1',
    abstract:
      'Spot-instances(SI) is an auction-based pricing scheme used by cloud providers. It allows users to place bids for spare computing instances and rent them at a substantially lower price compared to the fixed on-demand price. This inexpensive computational power is at the cost of availability, because a spot instance can be revoked whenever the spot market price exceeds the bid. Therefore, SI has become an attractive option for applications without requiring real-time availability constraints, such as the batch jobs in different application domains, including big data analytics, scientific computing, and deep learning. For batch jobs, service interruptions and execution delays can be tolerated as long as their service quality is gauged by an execution deadline. Hence, this paper aims to develop a static bidding strategy for minimizing the monetary cost of a batch job with hard deadline constraints. We formulate the problem as a Markov chain process and use Dynamic Programming to find the optimal bid in polynomial time. Experiments conducted on real workloads from Amazon Spot Instance historical prices show that our proposed strategy successfully outperformed two state-of-art dynamic bidding strategies~(Amazing, DBA), and several deadline agnostic static bidding strategies with lower cost and fault tolerance overhead.',
    image: '/bidding.webp',
    bib: `@conference{closer23,
author={Kai-Siang Wang. and Cheng-Han Hsieh. and Jerry Chou.},
title={Optimal Static Bidding Strategy for Running Jobs with Hard Deadline Constraints on Spot Instances},
booktitle={Proceedings of the 13th International Conference on Cloud Computing and Services Science - CLOSER},
year={2023},
pages={123-130},
publisher={SciTePress},
organization={INSTICC},
doi={10.5220/0011645400003488},
isbn={978-989-758-650-7},
issn={2184-5042},
}`,
    date: '4/23/2023',
    selected: true,
  },
];

export default pubs;
export function getPubs(sort?: string, selected?: boolean, group?: boolean) {
  let _pubs = pubs;
  if (group) {
    let groups: { pubs: any[]; year: number }[] = [];
    _pubs.forEach((pub) => {
      let year = new Date(pub.date).getFullYear();
      let group = groups.find((g) => g.year === year);
      if (!group) {
        group = { year, pubs: [] };
        groups.push(group);
      }
      group.pubs.push(pub);
    });
    groups = groups.sort((a, b) => (a.year > b.year ? -1 : 1));
    return groups;
  }
  if (selected) {
    _pubs = _pubs.filter((pub) => pub.selected);
  }
  if (sort) {
    const asc = sort === 'asc' ? 1 : -1;
    _pubs = _pubs.sort((a, b) =>
      moment(a.date, 'MM/DD/YYYY').isBefore(moment(b.date, 'MM/DD/YYYY')) ? -1 * asc : 1 * asc
    );
  }
  return _pubs;
}
