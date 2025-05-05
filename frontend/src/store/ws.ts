// stores/useWebSocketStore.ts
import { create } from 'zustand';

type Message = {
  type: string;
  data: {
    [key: string]: any;
  };
};

interface WebSocketState {
  messageQueues: MessageQueue;
  sendMessage: (msg: any) => void;
  enqueueMessage: (queue: string, message: Message) => void;
  dequeueMessage: (queue: string) => Message | undefined;
  connect: () => void;
  disconnect: () => void;
}

let socket: WebSocket | null = null;

type MessageQueue = Record<string, Message[]>;

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  messageQueues: {},
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
  sendMessage: (msg) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
    }
  },
  connect: () => {
    if (socket && socket.readyState !== WebSocket.CLOSED) return;

    socket = new WebSocket(`ws://${process.env.REACT_APP_API_ADDR}/ws`);

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data) as Message;
      get().enqueueMessage(msg.type, msg);
    };

    socket.onopen = () => {
      console.log('WebSocket connected');
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
    };

    socket.onerror = (e) => {
      console.error('WebSocket error', e);
    };
  },
  disconnect: () => {
    if (socket) {
      socket.close();
      socket = null;
    }
  },
}));
