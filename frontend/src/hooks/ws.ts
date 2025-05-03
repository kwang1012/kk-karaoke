import { useCallback, useEffect, useRef, useState } from 'react';

export function useWebSocketQueue(wsUrl: string) {
  const [queue, setQueue] = useState<Song[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connection established');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'init' || msg.type === 'queue_updated') {
        setQueue(msg.queue);
      }
    };

    ws.onclose = () => {
      console.warn('WebSocket connection closed');
    };

    //   return () => {
    //     ws.close();
    //   };
  }, [wsUrl]);

  const addSong = useCallback((song: Song) => {
    wsRef.current?.send(JSON.stringify({ type: 'add', song }));
  }, []);

  return { queue, addSong, connected };
}
