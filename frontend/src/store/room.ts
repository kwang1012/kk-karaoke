import { api } from 'src/utils/api';
import { create } from 'zustand';

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
}

export const useRoomStore = create<RoomState>((set, get) => ({
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
  fetchRoomId: async () => {
    const { data } = await api.get('/room');
    set(() => ({
      roomId: data.roomId,
      participants: data.participants,
    }));
  },
}));

export const useRoom = () => {
  const roomId = useRoomStore((state) => ({
    id: state.roomId,
    joinedId: state.joinedRoom,
    participants: state.participants,
  }));
  return roomId;
};
