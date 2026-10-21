import { usePlayerStore } from 'src/store/player';
import { useActiveRoomId, useJam } from 'src/store/room';
import { useSettingStore } from 'src/store/setting';
import { useWebSocketStore } from 'src/store/ws';

/** One screen mode for the player and every remote controlling it. */
export function useVideoMode() {
  const { isOwner } = useJam();
  const roomId = useActiveRoomId();
  const localShowVideo = useSettingStore((state) => state.showVideo);
  const hostShowVideo = usePlayerStore((state) => state.hostShowVideo);
  const showVideo = isOwner ? localShowVideo : hostShowVideo;

  const setShowVideo = (value: boolean) => {
    if (isOwner) useSettingStore.getState().setShowVideo(value);
    usePlayerStore.getState().setHostShowVideo(value);
    useWebSocketStore.getState().sendMessage({
      type: 'jam', action: 'control', op: 'setShowVideo', roomId, data: { value },
    });
  };
  return { showVideo, setShowVideo };
}
