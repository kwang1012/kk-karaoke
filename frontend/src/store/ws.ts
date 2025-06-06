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
  messageQueues: MessageQueue;
  connected: boolean;
  error: any;
  sendMessage: (msg: any) => void;
  enqueueMessage: (queue: string, message: Message) => void;
  dequeueMessage: (queue: string) => Message | undefined;
  connect: () => void;
  disconnect: () => void;
}

let socket: WebSocket | null = null;

export type MessageQueue = Record<string, Message[]>;

let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let manualDisconnect = false; // Tracks intentional disconnects
let retryCount = 0;
const maxRetries = 10;
const baseDelay = 1000; // 1 second

function getBackoffDelay(attempt: number) {
  const maxDelay = 30000; // 30 seconds cap
  const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
  const jitter = Math.random() * 1000; // up to 1s jitter
  return delay + jitter;
}

const protocol = getSchemesForAddress(import.meta.env.VITE_API_ADDR).ws;

export const useWebSocketStore = create<WebSocketState>()(
  subscribeWithSelector((set, get) => ({
    messageQueues: {},
    connected: false,
    error: null,
    sendMessage: (msg: any) => {
      // TODO: temporarily disable sending messages
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      } else {
        console.error('WebSocket is not connected');
      }
    },
    // Enqueue a message into a queue
    enqueueMessage: (queue, message) => {
      set((state) => ({
        messageQueues: {
          ...state.messageQueues,
          [queue]: [...(state.messageQueues[queue] || []), message],
        },
      }));
    },
    // Dequeue (remove) the first message from the queue
    dequeueMessage: (queue) => {
      const current = get().messageQueues[queue] || [];
      if (current.length === 0) return undefined;

      const [first, ...rest] = current;
      set((state) => ({
        messageQueues: {
          ...state.messageQueues,
          [queue]: rest,
        },
      }));
      return first;
    },
    connect: () => {
      if (get().connected) return;
      if (socket && socket.readyState !== WebSocket.CLOSED) return;

      socket = new WebSocket(`${protocol}${import.meta.env.VITE_API_ADDR}/api/ws`);

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data) as Message;
        get().enqueueMessage(msg.type, msg);
      };

      socket.onopen = () => {
        console.log('WebSocket connected');
        set({ connected: true, error: null });
        retryCount = 0;
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      };

      socket.onclose = () => {
        set({ connected: false });

        if (!manualDisconnect && retryCount < maxRetries) {
          const delay = getBackoffDelay(retryCount++);
          console.warn(`WebSocket closed, retrying in ${Math.round(delay)}ms`);
          reconnectTimeout = setTimeout(() => {
            get().connect();
          }, delay);
        } else if (retryCount >= maxRetries) {
          console.error('Max WebSocket reconnection attempts reached.');
        }
      };

      socket.onerror = (e) => {
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
