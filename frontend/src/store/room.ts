import { api } from 'src/utils/api';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type Person = {
  nickName: string; // The ID of the person
  avatar: string; // The ID of the person
};

export interface RoomState {
  roomId: string; // The ID of the room
  joinedRoom: string;
  participants: Person[];
  setJoinedRoom: (roomId: string) => void; // Set the ID of the room
  setRoomId: (roomId: string) => void; // Set the ID of the room
  addParticipant: (person: Person) => void; // Add a participant to the room
  removeParticipant: (person: Person) => void; // Remove a participant from the room
  fetchRoom: () => Promise<void>; // Fetch the room ID from the server
}

export const useRoomStore = create<RoomState>()(
  persist(
    (set, get) => ({
      roomId: '',
      joinedRoom: '',
      participants: [],
      setRoomId: (roomId: string) =>
        set(() => ({
          roomId,
        })),
      setJoinedRoom: (roomId: string) =>
        set(() => ({
          joinedRoom: roomId,
        })),
      addParticipant: (person: Person) => ({
        participants: [...get().participants, person],
      }),
      removeParticipant: (person: Person) => ({
        participants: get().participants.filter((p) => p.nickName !== person.nickName),
      }),
      //
      fetchRoom: async () => {
        const { data } = await api.get('/room');
        set(() => ({
          roomId: data.roomId,
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

export const useRoom = () => {
  const roomId = useRoomStore((state) => ({
    id: state.roomId,
    joinedId: state.joinedRoom,
    participants: state.participants,
  }));
  return roomId;
};
