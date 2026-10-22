import { api } from 'src/utils/api';
import { useActiveRoomId, useJam, useRoomStore } from 'src/store/room';
import { useShareOrigin } from 'src/hooks/shareOrigin';
import { getChosenBackendAddress } from 'src/utils/backend';
import { openLogin } from 'src/lib/auth';

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
  const origin = useShareOrigin();
  // A guest's browser doesn't know this site's backend (it may be a tunnel address), so the link carries it.
  const backend = getChosenBackendAddress();
  const joinURL = `${origin}/join?room=${activeRoomId}${backend ? `&backend=${encodeURIComponent(backend)}` : ''}`;

  const startRoom = async () => {
    if (!roomId) return;
    // Opening a jam is for invited hosts.
    if (!openLogin('host')) return;
    const { data } = await api.post('room/create', { id: roomId });
    setCode(data.code);
    setJoinedRoom(roomId);
  };
  return { inRoom, hosting, joinURL, code, startRoom };
}
