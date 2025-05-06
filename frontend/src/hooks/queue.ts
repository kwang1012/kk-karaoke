import { useEffect } from 'react';
import { useWebSocketStore } from 'src/store/ws';

type RemoteMessageQueueArgs = {
  onAddItem?: (item: any) => void;
  onRemoveItem?: (item: any) => void;
  onClearQueue?: () => void;
};
export const useRemoteMessageQueue = (
  queue: string,
  { onAddItem, onRemoveItem, onClearQueue }: RemoteMessageQueueArgs
) => {
  useEffect(() => {
    const unsub = useWebSocketStore.subscribe(
      (state) => state.messageQueues[queue],
      (newQueue, prevQueue) => {
        newQueue = newQueue || [];
        prevQueue = prevQueue || [];
        const added = newQueue.length > prevQueue.length;
        const removed = newQueue.length < prevQueue.length;
        const cleared = newQueue.length === 0 && prevQueue.length > 0;

        if (cleared) {
          onClearQueue?.();
        } else if (added) {
          const newItems = newQueue.slice(prevQueue.length);
          newItems.forEach((item) => onAddItem?.(item));
        } else if (removed) {
          const removedItems = prevQueue.filter((item) => !newQueue.includes(item));
          removedItems.forEach((item) => onRemoveItem?.(item));
        }
      },
      { fireImmediately: false }
    );

    return () => unsub();
  }, [onAddItem, onRemoveItem, onClearQueue]);
};
