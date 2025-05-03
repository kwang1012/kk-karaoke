import { useEffect, useMemo, useState } from 'react';

export function usePageView() {
  const [time, setTime] = useState(0);
  useEffect(() => {
    const handleIntervalTick = setInterval(() => {
      setTime((t) => t + 1);
    });

    return () => {
      clearInterval(handleIntervalTick);
    };
  }, []);

  return useMemo(() => {}, [time]);
}
