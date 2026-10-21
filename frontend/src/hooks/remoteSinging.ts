import { useEffect, useState } from 'react';
import { remoteActive } from 'src/remotePitch';

const CHECK_MS = 500;

/** Whether someone is singing into a phone in this room right now (see remotePitch.ts). */
export function useRemoteSinging(): boolean {
  const [active, setActive] = useState(remoteActive());
  useEffect(() => {
    const timer = setInterval(() => setActive(remoteActive()), CHECK_MS);
    return () => clearInterval(timer);
  }, []);
  return active;
}
