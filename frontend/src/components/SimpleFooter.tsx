import React from 'react';
import Calendar from 'react-calendar';
import axios from 'axios';
import { useEffect, useState } from 'react';
import moment from 'moment';
import { Link } from 'react-router-dom';
import { getEvents } from 'src/utils';
import { useSelector } from 'react-redux';
import { RootState } from 'src/store';

export default function SimpleFooter() {
  const currentTheme = useSelector((state: RootState) => state.theme.value);
  const [events, setEvents] = useState([]);
  async function updateEvents(isMounted: boolean) {
    getEvents(true).then((events) => {
      if (isMounted) setEvents(events);
    });
  }

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let isMounted = true;
    updateEvents(isMounted);

    // map script
    const script = document.createElement('script');

    script.src =
      '//cdn.clustrmaps.com/map_v2.js?cl=ffffff&w=a&t=m&d=-buCz0retZ5htBaa04-Q4KlBSbCTjKPNCloS21z6WhU&co=cc3363&cmo=ff7272&cmn=78f778';
    script.id = 'clustrmaps';

    script.onload = () => {
      if (isMounted) setLoading(false);
    };

    document.getElementById('map-container')?.appendChild(script);
    return () => {
      isMounted = false;
      try {
        document.getElementById('map-container')?.removeChild(script);
      } catch {
        console.warn('Failed to remove map script');
      }
    };
  }, []);

  return (
    <div className="text-center mt-40 flex flex-col justify-end p-5">
      <div className="flex justify-center flex-wrap gap-4">
        <div className="flex-shrink-0 w-[300px] mb-4" id="map-container" key="unique-map"></div>
        <Link to="/schedule">
          <div className={'flex-shrink-0 w-[300px] h-[176px] ' + currentTheme}>
            <Calendar
              calendarType="hebrew"
              minDetail="year"
              className="hide-navigation tile-center"
              tileClassName={({ date, activeStartDate }) => {
                return date.getMonth() !== activeStartDate.getMonth() ? 'disabled' : '';
              }}
              tileDisabled={({ date, activeStartDate }) => date.getMonth() !== activeStartDate.getMonth()}
              formatShortWeekday={(_, date) => moment(date).format('dd')[0]}
              tileContent={({ date }) => {
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const day = date.getDate();
                if (!events[year] || !events[year][month] || !events[year][month][day]) return <></>;
                return <div className="h-1 w-1 flex-shrink-0 rounded-full bg-primary mx-auto" />;
              }}
              formatDay={(_, date) => date.getDate().toString()}
            />
          </div>
        </Link>
      </div>
      <span className="mt-10">Copyright © 2021-2024 Kai Wang</span>
    </div>
  );
}
