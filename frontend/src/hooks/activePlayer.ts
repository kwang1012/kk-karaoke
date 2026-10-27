import { useEffect, useRef } from 'react';
import { getDeviceId } from 'src/deviceId';
import { setDeviceClaimer, usePlayerTabStore } from 'src/store/playerTab';
import { useActiveRoomId, useJam } from 'src/store/room';
import { addMessageListener, useWebSocketStore } from 'src/store/ws';

/**
 * Keeps this device's view of which device of the account plays, and asks to be the player when nobody is:
 * opening the app while nothing plays makes this device the player, opening it while another plays does not.
 */
export function useActivePlayer() {
  const roomId = useActiveRoomId();
  const { isRoomOwner } = useJam();
  const isPlayerTab = usePlayerTabStore((state) => state.isPlayerTab);
  const preferThisDevice = usePlayerTabStore((state) => state.preferThisDevice);
  const connected = useWebSocketStore((state) => state.connected);
  const sendMessage = useWebSocketStore((state) => state.sendMessage);
  const room = useRef(roomId);
  room.current = roomId;

  useEffect(() => {
    usePlayerTabStore.setState({ activeDevice: undefined });
  }, [roomId]);

  useEffect(
    () =>
      addMessageListener('jam', (message) => {
        if (message.action !== 'player' || message.roomId !== room.current) return;
        usePlayerTabStore.setState({ activeDevice: message.data?.deviceId ?? null });
      }),
    []
  );

  const claim = (ifFree: boolean) =>
    sendMessage({ type: 'jam', action: 'player', roomId, data: { deviceId: getDeviceId(), ifFree } });

  useEffect(() => {
    if (roomId === 'default') return;
    setDeviceClaimer(() => claim(false));
    return () => setDeviceClaimer(null);
  }, [roomId, sendMessage]);

  useEffect(() => {
    if (!connected || !isRoomOwner || !isPlayerTab || roomId === 'default') return;
    claim(!preferThisDevice);
  }, [connected, isRoomOwner, isPlayerTab, roomId, preferThisDevice]);
}
