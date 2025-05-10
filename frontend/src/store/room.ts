import { useMemo } from 'react';
import { User } from 'src/models/user';
import { api } from 'src/utils/api';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface RoomState {
  roomId: string; // The ID of the room
  joinedRoom?: string;
  participants: User[];
  setJoinedRoom: (roomId: string) => void; // Set the ID of the room
  setRoomId: (roomId: string) => void; // Set the ID of the room
  addParticipant: (person: User) => void; // Add a participant to the room
  removeParticipant: (person: User) => void; // Remove a participant from the room
  fetchRoom: () => Promise<void>; // Fetch the room ID from the server
}

export const useRoomStore = create<RoomState>()(
  persist(
    (set, get) => ({
      roomId: 'default', // this will be overwritten by App.tsx
      participants: [],
      setRoomId: (roomId: string) =>
        set(() => ({
          roomId,
        })),
      setJoinedRoom: (roomId: string) =>
        set(() => ({
          joinedRoom: roomId,
        })),
      addParticipant: (person: User) => ({
        participants: [...get().participants, person],
      }),
      removeParticipant: (person: User) => ({
        participants: get().participants.filter((p) => p.id !== person.id),
      }),
      //
      fetchRoom: async () => {
        const activeRoomId = get().joinedRoom || get().roomId;
        const { data } = await api.get(`/room/${activeRoomId}/participants`).catch((err) => {
          console.error('Error fetching room participants:', err);
          return { data: { participants: [] } };
        });
        set(() => ({
          participants: data.participants,
        }));
      },
    }),
    {
      name: 'room-storage', // unique name
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const useJam = () => {
  const roomId = useRoomStore((state) => state.roomId);
  const joinedRoom = useRoomStore((state) => state.joinedRoom);
  const participants = useRoomStore((state) => state.participants);
  const isInJam = useMemo(() => {
    if (roomId === 'default') return false;
    if (joinedRoom === undefined) return false;
    if (joinedRoom === '') return false;
    return roomId !== joinedRoom;
  }, [roomId, joinedRoom]);
  const isOwner = useMemo(() => !isInJam, [roomId, joinedRoom]);
  const shouldBroadcast = useMemo(() => participants.length > 0, [roomId, joinedRoom]);
  return {
    isInJam,
    isOwner,
    participants,
    shouldBroadcast,
  };
};
