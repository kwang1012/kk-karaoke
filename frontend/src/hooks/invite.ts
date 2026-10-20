import { api } from 'src/utils/api';
import { useActiveRoomId, useJam, useRoomStore } from 'src/store/room';

/** Everything needed to invite people: whether a room is open, its join link and code, and how to open one. */
export function useInvite() {
  const roomId = useRoomStore((state) => state.roomId);
  const joinedRoom = useRoomStore((state) => state.joinedRoom);
  const setJoinedRoom = useRoomStore((state) => state.setJoinedRoom);
  const code = useRoomStore((state) => state.code);
  const setCode = useRoomStore((state) => state.setCode);
  const activeRoomId = useActiveRoomId();
  const { isInJam } = useJam();

  const hosting = !!roomId && joinedRoom === roomId;
  const inRoom = hosting || isInJam;
  const joinURL = `${window.location.protocol}//${window.location.host}/join?room=${activeRoomId}`;

  const startRoom = async () => {
    if (!roomId) return;
    const { data } = await api.post('room/create', { id: roomId });
    setCode(data.code);
    setJoinedRoom(roomId);
  };
  return { inRoom, hosting, joinURL, code, startRoom };
}
