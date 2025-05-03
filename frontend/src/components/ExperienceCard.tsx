import React from 'react';
import moment from 'moment';

const isSemester = (date: string) => date.includes('Fall') || date.includes('Spring');

export default function ExperienceCard({
  exp,
  sm = false,
}: {
  exp: { [key: string]: any; projects: any[] };
  sm?: boolean;
}) {
  return (
    <div
      className={['mt-4', sm ? 'px-4' : 'shadow-md mt-4 border border-solid border-gray-200 p-5 rounded-md'].join(' ')}
    >
      <div className={sm ? '' : 'text-lg'}>
        {exp.link ? (
          <a
            className="font-bold text-blue-500 hover:underline cursor-pointer"
            href={exp.link}
            target="_blank"
            rel="noreferrer"
          >
            {exp.title}
          </a>
        ) : (
          <span className="font-bold">{exp.title}</span>
        )}
        {exp.corp && <span className="font-bold"> @ {exp.corp}</span>}
        <span>, {exp.place}</span>
      </div>
      <div className={[sm ? 'text-sm' : 'mt-2'].join(' ')}>
        {exp.position}.{' '}
        {isSemester(exp.startDate) ? exp.startDate : moment(exp.startDate, 'MM/DD/YYYY').format('MMM YYYY') + ' - '}
        {isSemester(exp.startDate)
          ? ''
          : exp.endDate
          ? moment(exp.endDate, 'MM/DD/YYYY').format('MMM YYYY')
          : 'Present'}
      </div>
      {exp.advisor && <div className={[sm ? 'text-sm' : 'mt-2'].join(' ')}>Advisor: {exp.advisor}</div>}
      {!sm && exp.projects?.length && (
        <ul>
          {exp.projects.map((proj, i) => (
            <li key={i}>{proj}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
