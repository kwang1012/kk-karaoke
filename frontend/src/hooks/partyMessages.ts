import { useEffect } from 'react';
import { applyPartyMessage, party } from 'src/party';
import { useRoomStore } from 'src/store/room';
import { addMessageListener } from 'src/store/ws';

/** Keeps this browser's picture of who is singing in the room (see party.ts), on whichever page it is. */
export function usePartyMessages() {
  useEffect(() => {
    const off = addMessageListener('jam', (message) => {
      const { joinedRoom, roomId } = useRoomStore.getState();
      if (message.roomId !== (joinedRoom || roomId)) return;
      applyPartyMessage(party, message);
    });
    // a different room is a different party
    const unsubscribe = useRoomStore.subscribe((state, previous) => {
      if ((state.joinedRoom || state.roomId) !== (previous.joinedRoom || previous.roomId)) party.clear();
    });
    return () => {
      off();
      unsubscribe();
    };
  }, []);
}
