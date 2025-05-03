import React from 'react';
import { getRExps, getTExps } from 'src/const/exps';
import ExperienceCard from 'src/components/ExperienceCard';

const rExps = getRExps('desc');
const tExps = getTExps('desc');

export default function ExperienceView() {
  return (
    <>
      <h2>Experiences</h2>
      <div className="mt-10 pb-2 text-2xl font-bold border-0 border-b border-gray-200 border-solid">
        Research Experiences
      </div>
      {rExps.map((exp, i) => (
        <ExperienceCard key={i} exp={exp} />
      ))}
      <div className="mt-10 pb-2 text-2xl font-bold border-0 border-b border-gray-200 border-solid">
        Teaching Experiences
      </div>
      {tExps.map((exp, i) => (
        <ExperienceCard key={i} exp={exp} />
      ))}
    </>
  );
}
