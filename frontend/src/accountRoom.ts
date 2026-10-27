/**
 * A signed-in host's room is their account id, so every device they sign in on shares one queue and jam.
 * Signed out, a device keeps a room of its own with a random id.
 */
interface Rooms {
  roomId?: string;
  joinedRoom?: string;
}

export interface RoomChange {
  roomId: string;
  joinedRoom?: string;
  /** The device room the server should move into the account room (it checks the account opened it). */
  migrateFrom?: string;
}

export function roomForAccount(
  { roomId, joinedRoom }: Rooms,
  userId: string | undefined,
  previousUserId: string | undefined,
  freshId: () => string
): RoomChange | null {
  if (userId) {
    if (roomId === userId) return null;
    return {
      roomId: userId,
      // a TV that opened its own room stays in it; a room joined with a code is kept
      joinedRoom: roomId && joinedRoom === roomId ? userId : joinedRoom,
      migrateFrom: roomId && roomId !== 'default' ? roomId : undefined,
    };
  }
  // Signed out: leave the account's room behind rather than keep using it as a guest of that account
  if (previousUserId && roomId === previousUserId) {
    return { roomId: freshId(), joinedRoom: joinedRoom === roomId ? undefined : joinedRoom };
  }
  return null;
}
