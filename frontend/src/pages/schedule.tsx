import { useState, useEffect } from 'react';
import Calendar from 'react-calendar';

import moment from 'moment';
import { Close } from '@mui/icons-material';
import { IconButton, CircularProgress } from '@mui/material';
import { useMemo } from 'react';
import { format, getEvents } from 'src/utils';
import AppEventCard from 'src/components/AppEventCard';
import { useSelector } from 'react-redux';
import { RootState } from 'src/store';

function sameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

export function ScheduleView() {
  const currentTheme = useSelector((state: RootState) => state.theme.value);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const today = new Date();
  async function updateEvents() {
    setLoading(true);
    getEvents()
      .then(setEvents)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    updateEvents();
  }, []);
  const [selectedDate, setSelectedDate] = useState<null | Date>(null);
  const selectedEvents = useMemo(() => {
    if (!selectedDate) return null;
    return events[selectedDate.getFullYear()]?.[selectedDate.getMonth() + 1]?.[selectedDate.getDate()] || [];
  }, [selectedDate, events]);
  const todayEvents = useMemo(() => {
    return events[today.getFullYear()]?.[today.getMonth() + 1]?.[today.getDate()] || [];
  }, [events]);
  return (
    <div className="flex">
      <div
        className={'transition-all h-screen bg-white overflow-hidden' + (selectedDate !== null ? ' w-[300px]' : ' w-0')}
      >
        <div className="flex justify-end p-2">
          <IconButton size="small" color="primary" onClick={() => setSelectedDate(null)}>
            <Close />
          </IconButton>
        </div>
        <div className="p-4 pt-0 w-[300px]">
          <h1 className="text-black text-xl m-0">Today's Events</h1>
          {todayEvents && todayEvents.length !== 0 ? (
            todayEvents.map((evt: any, i: number) => <AppEventCard key={i} event={evt} />)
          ) : (
            <div className=" text-gray-400 text-center my-3">none</div>
          )}
          {selectedDate && !sameDay(selectedDate, today) && (
            <>
              <h1 className="text-black text-xl m-0 mt-5">{moment(selectedDate).format('yyyy-MM-DD')} Events</h1>
              {selectedEvents && selectedEvents.length !== 0 ? (
                selectedEvents.map((evt: any, i: number) => <AppEventCard key={i} event={evt} />)
              ) : (
                <div className=" text-gray-400 text-center my-3">none</div>
              )}
            </>
          )}
        </div>
      </div>

      <Calendar
        value={selectedDate}
        calendarType="hebrew"
        onClickDay={setSelectedDate}
        minDetail="year"
        className={'full ' + currentTheme}
        navigationLabel={({ label }) => (
          <div className="flex items-center justify-center">
            <div>{label}</div>
            {loading && <CircularProgress color="primary" className="ml-2" size={10} />}
          </div>
        )}
        tileClassName={({ date, activeStartDate }) => {
          return date.getTime() === selectedDate?.getTime()
            ? 'today'
            : date.getMonth() !== activeStartDate.getMonth()
            ? 'disabled'
            : '';
        }}
        tileDisabled={({ date, activeStartDate }) => {
          return date.getMonth() !== activeStartDate.getMonth();
        }}
        tileContent={({ date, view }) => {
          if (view !== 'month') return <></>;
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const day = date.getDate();
          if (!events[year] || !events[year][month] || !events[year][month][day]) return <></>;
          return (
            <>
              {events[year][month][day].map((evt: any, i: number) => (
                <div key={i} className="flex items-center last:mb-2">
                  <div className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  <div className="ml-2 hidden flex-shrink-0 text-sm lg:block">
                    {format(evt.start.dateTime || evt.start.date)}
                  </div>
                  <div className="ml-2 text-xs line-clamp-1 md:text-sm">{evt.summary}</div>
                </div>
              ))}
            </>
          );
        }}
        formatDay={(_, date) => date.getDate().toString()}
      />
    </div>
  );
}
