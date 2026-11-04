import { getDeviceId } from 'src/deviceId';
import type { DuetPart } from 'src/duetSession';
import { party, type Singer, type Standing } from 'src/party';
import { useRoomStore } from 'src/store/room';
import { useWebSocketStore } from 'src/store/ws';

/** What a phone or the screen says to the room about singing in the same room (see party.ts). */
function send(action: 'party' | 'pitch', op: string | undefined, data: Record<string, unknown>) {
  const { joinedRoom, roomId } = useRoomStore.getState();
  const { connected, sendMessage } = useWebSocketStore.getState();
  if (!connected) return;
  sendMessage({ type: 'jam', action, ...(op ? { op } : {}), roomId: joinedRoom || roomId || 'default', data });
}

/** This device as a singer: named by the browser, so a phone that reloads is still the same singer. */
export function mySinger(part: DuetPart): Singer {
  const { nickname, avatar } = useRoomStore.getState();
  return { id: getDeviceId(), name: nickname || 'Singer', avatar: avatar ?? '', part };
}

/** Says (again) that this phone is singing, and which part. Sent every few seconds too, so the screen keeps the list. */
export const joinParty = (part: DuetPart) => {
  const singer = mySinger(part);
  party.join(singer);
  send('party', 'join', { singer });
};

export const leaveParty = () => {
  const { id } = mySinger(0);
  party.leave(id);
  send('party', 'leave', { id });
};


/** Screen to everyone: where each singer stands, so the phones can show it. */
export const announceScores = (scores: Record<string, number | null>) => send('party', 'scores', { scores });

/** Screen to everyone: the finished standings. */
export const announceStandings = (standings: Standing[]) =>
  send('party', 'standings', {
    standings: standings.map(({ id, name, avatar, part, result }) => ({ id, name, avatar, part, total: result?.total ?? null })),
  });
