import { useEffect, useRef } from 'react';
import { Message, addMessageListener } from 'src/store/ws';

type RemoteMessageQueueArgs = {
  onAddItem?: (item: Message & { [key: string]: any }) => void;
};

// Calls `onAddItem` for every websocket message of type `queue`. Messages are delivered
// as they arrive and not stored, so long sessions don't accumulate them in memory.
export const useRemoteMessageQueue = (queue: string, { onAddItem }: RemoteMessageQueueArgs) => {
  // Always call the latest callback without resubscribing on every render.
  const handler = useRef(onAddItem);
  handler.current = onAddItem;

  useEffect(() => addMessageListener(queue, (message) => handler.current?.(message)), [queue]);
};
