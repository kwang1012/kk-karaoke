import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getSchemesForAddress } from 'src/utils';

export type Message = {
  type: string;
  data: {
    [key: string]: any;
  };
};

interface WebSocketState {
  connected: boolean;
  error: any;
  sendMessage: (msg: any) => void;
  connect: () => void;
  disconnect: () => void;
}

let socket: WebSocket | null = null;

// Incoming messages are dispatched straight to listeners (by message type) instead of
// being stored; the old per-type arrays grew forever and were copied on every message.
type Listener = (message: any) => void;
const listeners = new Map<string, Set<Listener>>();

export function addMessageListener(type: string, listener: Listener): () => void {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(listener);
  return () => {
    listeners.get(type)?.delete(listener);
  };
}

// Control messages sent while the socket is down are replayed on reconnect (if recent),
// otherwise the local UI changes but other jam participants never hear about it.
const PENDING_MAX = 20;
const PENDING_MAX_AGE_MS = 10_000;
let pending: { msg: any; at: number }[] = [];

// Time of the last control message this client sent; used to ignore stale remote state.
export let lastControlSentAt = 0;

let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let manualDisconnect = false; // Tracks intentional disconnects
let retryCount = 0;
const baseDelay = 1000; // 1 second

function getBackoffDelay(attempt: number) {
  const maxDelay = 30000; // 30 seconds cap
  const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
  const jitter = Math.random() * 1000; // up to 1s jitter
  return delay + jitter;
}

const { ws: protocol, address } = getSchemesForAddress();

export const useWebSocketStore = create<WebSocketState>()(
  subscribeWithSelector((set, get) => ({
    connected: false,
    error: null,
    sendMessage: (msg: any) => {
      const isControl = msg?.type === 'jam' && msg?.action === 'control';
      if (isControl) lastControlSentAt = Date.now();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      } else if (isControl) {
        console.warn('WebSocket is not connected; will send when it reconnects');
        pending = [...pending, { msg, at: Date.now() }].slice(-PENDING_MAX);
      } else {
        console.warn('WebSocket is not connected');
      }
    },
    connect: () => {
      manualDisconnect = false;
      if (get().connected) return;
      if (socket && socket.readyState !== WebSocket.CLOSED) return;

      const ws = new WebSocket(`${protocol}${address}/api/ws`);
      socket = ws;

      ws.onmessage = (event) => {
        let msg: Message;
        try {
          msg = JSON.parse(event.data) as Message;
        } catch {
          return;
        }
        listeners.get(msg.type)?.forEach((listener) => {
          try {
            listener(msg);
          } catch (e) {
            console.error('WebSocket listener failed', e);
          }
        });
      };

      ws.onopen = () => {
        console.log('WebSocket connected');
        set({ connected: true, error: null });
        retryCount = 0;
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        const now = Date.now();
        const toSend = pending.filter((p) => now - p.at <= PENDING_MAX_AGE_MS);
        pending = [];
        toSend.forEach((p) => ws.send(JSON.stringify(p.msg)));
      };

      ws.onclose = () => {
        const wasCurrent = socket === ws;
        if (wasCurrent) socket = null;
        if (!wasCurrent && socket !== null) return; // a newer socket already replaced this one
        set({ connected: false });

        // Keep retrying (capped backoff): giving up after N attempts left tabs offline for good.
        if (!manualDisconnect) {
          const delay = getBackoffDelay(retryCount++);
          console.warn(`WebSocket closed, retrying in ${Math.round(delay)}ms`);
          reconnectTimeout = setTimeout(() => {
            get().connect();
          }, delay);
        }
      };

      ws.onerror = (e) => {
        set({ error: e });
      };
    },
    disconnect: () => {
      console.log('Disconnecting WebSocket...');
      manualDisconnect = true;
      retryCount = 0;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (socket) {
        socket.close();
        socket = null;
      }
    },
  }))
);

// Reconnect right away when the network or tab comes back instead of waiting out a backoff.
function reconnectNow() {
  const { connected, connect } = useWebSocketStore.getState();
  if (manualDisconnect || connected) return;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  retryCount = 0;
  connect();
}
window.addEventListener('online', reconnectNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') reconnectNow();
});
