// stores/useWebSocketStore.ts
import { create } from 'zustand';

type Message = {
  id: number;
  message: any;
};

interface WebSocketState {
  messages: Message[];
  sendMessage: (msg: string) => void;
  connect: () => void;
  disconnect: () => void;
}

let socket: WebSocket | null = null;

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  messages: [],
  sendMessage: (msg) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
    }
  },
  connect: () => {
    if (socket && socket.readyState !== WebSocket.CLOSED) return;

    socket = new WebSocket('ws://localhost:8000/ws');

    socket.onmessage = (event) => {
      console.log('WebSocket message received:', event.data);
      set((state) => ({
        messages: [...state.messages, event.data],
      }));
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
  removeMessage: (id: number) => {
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== id),
    }));
  },
}));
