import { useRoomStore } from 'src/store/room';
import { useWebSocketStore } from 'src/store/ws';
import { useDuetStore } from 'src/store/duet';
import type { DuetPart, DuetStatus } from 'src/duetSession';

/** What a person can do about singing together; the server answers everyone in the room (see `DuetPlayer`). */
function send(op: string, data: Record<string, unknown> = {}) {
  const { joinedRoom, roomId } = useRoomStore.getState();
  useWebSocketStore.getState().sendMessage({
    type: 'jam',
    action: 'duet',
    op,
    roomId: joinedRoom || roomId || 'default',
    data: { member: useDuetStore.getState().memberId, ...data },
  });
}

/** Opens a lobby for a song: everyone in the room is asked to get ready. */
export const openDuet = (trackId: string) => send('open', { trackId });
export const reportDuet = (status: DuetStatus, progress = status === 'ready' ? 1 : 0) =>
  send('report', { status, progress, part: useDuetStore.getState().part });
export const chooseDuetPart = (part: DuetPart) => {
  useDuetStore.getState().setPart(part);
  send('report', { part });
};
/** Starts the song for everyone, after a countdown. Only the person who opened the lobby can. */
export const beginDuet = () => send('begin');
export const pauseDuet = () => send('pause');
export const resumeDuet = () => send('resume');
export const restartDuet = () => send('restart');
export const stopDuet = () => send('stop');
/** Sits this one out: the lobby closes here and the song is not played on this device. */
export const leaveDuet = () => {
  useDuetStore.getState().setDeclined(true);
  send('report', { status: 'out' });
};
