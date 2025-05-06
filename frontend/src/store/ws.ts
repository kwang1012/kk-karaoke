import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type Message = {
  type: string;
  data: {
    [key: string]: any;
  };
};

interface WebSocketState {
  messageQueues: MessageQueue;
  connected: boolean;
  initialized: boolean;
  error: any;
  // sendMessage: (msg: any) => void;
  enqueueMessage: (queue: string, message: Message) => void;
  dequeueMessage: (queue: string) => Message | undefined;
  connect: () => void;
  disconnect: () => void;
}

let socket: WebSocket | null = null;

export type MessageQueue = Record<string, Message[]>;

export const useWebSocketStore = create<WebSocketState>()(
  subscribeWithSelector((set, get) => ({
    messageQueues: {},
    connected: false,
    initialized: false,
    error: null,
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
      if (socket && socket.readyState !== WebSocket.CLOSED) return;

      socket = new WebSocket(`ws://${process.env.REACT_APP_API_ADDR}/ws`);

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data) as Message;
        console.log('Received message:', msg.type);
        if (msg.type === 'init') {
          ('Initalized websocket connection');
          set({ initialized: true });
          return;
        }
        get().enqueueMessage(msg.type, msg);
      };

      socket.onopen = () => {
        set({ connected: true });
      };

      socket.onclose = () => {
        set({ connected: false });
      };

      socket.onerror = (e) => {
        set({ error: e });
      };
    },
    disconnect: () => {
      if (socket) {
        socket.close();
        socket = null;
      }
    },
  }))
);
