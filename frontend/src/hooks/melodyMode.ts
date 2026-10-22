import { usePlayerStore } from 'src/store/player';
import { useActiveRoomId, useJam } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
import { useWebSocketStore } from 'src/store/ws';

/** Whether the melody is drawn on the screen that plays: one answer for the player and every remote. */
export function useMelodyMode() {
  const { isOwner } = useJam();
  const roomId = useActiveRoomId();
  const localShowMelody = useSettingStore((state) => state.showMelody);
  const hostShowMelody = usePlayerStore((state) => state.hostShowMelody);
  const showMelody = isOwner ? localShowMelody : hostShowMelody;

  const setShowMelody = (value: boolean) => {
    if (isOwner) useSettingStore.getState().setShowMelody(value);
    usePlayerStore.getState().setHostShowMelody(value);
    useWebSocketStore.getState().sendMessage({
      type: 'jam', action: 'control', op: 'setShowMelody', roomId, data: { value },
    });
  };
  return { showMelody, setShowMelody };
}
