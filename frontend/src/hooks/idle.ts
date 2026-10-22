import { useEffect, useState } from 'react';

/** True after `ms` without mouse, touch or keyboard activity. Always false while `enabled` is false. */
export function useIdle(ms: number, enabled = true) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    setIdle(false);
    if (!enabled) return;
    let timer = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      clearTimeout(timer);
      setIdle(false);
      timer = setTimeout(() => setIdle(true), ms);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [ms, enabled]);
  return idle;
}
