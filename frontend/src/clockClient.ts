import { addMessageListener, useWebSocketStore } from './store/ws';
import { clock, clockSample, localNow } from './clockSync';

const BURST = 6; // pings sent back to back right after connecting, to get a good estimate quickly
const BURST_GAP_MS = 150;
const REFRESH_MS = 15_000; // afterwards, one ping now and then to follow drift

const sentAt = new Map<string, number>();
let seq = 0;

function ping() {
  const id = String(++seq);
  sentAt.set(id, localNow());
  useWebSocketStore.getState().sendMessage({ type: 'clock', id });
}

/** Keep `clock` in step with the server's for as long as the socket stays connected. Returns a stop function. */
export function startClockSync(): () => void {
  const off = addMessageListener('clock', (message) => {
    const sent = sentAt.get(String(message.id));
    sentAt.delete(String(message.id));
    if (sent === undefined || typeof message.serverTime !== 'number') return;
    clock.add(clockSample(sent, message.serverTime, localNow()));
  });

  let timers: ReturnType<typeof setTimeout>[] = [];
  const run = () => {
    timers.forEach(clearTimeout);
    timers = Array.from({ length: BURST }, (_, i) => setTimeout(ping, i * BURST_GAP_MS));
  };
  const unsubscribe = useWebSocketStore.subscribe((s) => s.connected, (connected) => connected && run());
  if (useWebSocketStore.getState().connected) run();
  const refresh = setInterval(() => useWebSocketStore.getState().connected && ping(), REFRESH_MS);

  return () => {
    off();
    unsubscribe();
    clearInterval(refresh);
    timers.forEach(clearTimeout);
    sentAt.clear();
  };
}
