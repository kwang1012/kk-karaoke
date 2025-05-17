import { useMemo } from 'react';
import { User } from 'src/models/user';
import { api } from 'src/utils/api';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface RoomState {
  roomId?: string; // The ID of the room
  joinedRoom?: string;
  avatar?: string; // The avatar of the user
  setAvatar: (avatar: string) => void; // Set the avatar of the user
  nickname?: string; // The nickname of the user
  setNickname: (nickname: string) => void; // Set the nickname of the user
  participants: User[]; // The participants in the room
  currentTime: number; // The current time of the room
  isOn: boolean; // Whether the user is online
  playing: boolean; // Whether the user is playing
  volume: number; // The volume of the room
  leaveRoom: () => void; // Leave the room
  setJoinedRoom: (roomId?: string) => void; // Set the ID of the room
  setRoomId: (roomId: string) => void; // Set the ID of the room
  addParticipant: (person: User) => void; // Add a participant to the room
  removeParticipant: (person: User) => void; // Remove a participant from the room
  fetchRoom: (roomId: string) => Promise<any>; // Fetch the room ID from the server
}

export const useRoomStore = create<RoomState>()(
  persist(
    (set, get) => ({
      participants: [],
      currentTime: 0,
      isOn: false,
      playing: false,
      volume: 0.8,
      setRoomId: (roomId: string) =>
        set(() => ({
          roomId,
          currentTime: 0,
          isOn: false,
          playing: false,
        })),
      setAvatar: (avatar: string) =>
        set(() => ({
          avatar,
        })),
      setNickname: (nickname: string) =>
        set(() => ({
          nickname,
        })),
      setJoinedRoom: (roomId?: string) =>
        set(() => ({
          joinedRoom: roomId,
        })),
      addParticipant: (person: User) => {
        const existing = get().participants;
        const exists = existing.some((item) => item.id === person.id);
        if (!exists) {
          set({ participants: [...existing, person] });
        }
      },
      removeParticipant: (person: User) => {
        set((state) => ({
          participants: state.participants.filter((p) => p.id !== person.id),
        }));
      },
      leaveRoom: () => {
        set(() => ({
          joinedRoom: undefined,
        }));
      },
      //
      fetchRoom: async (activeRoomId: string) => {
        try {
          const { data } = await api.get(`/room/${activeRoomId}`);
          set({
            participants: data.participants,
            currentTime: data.currentTime,
            isOn: data.isOn,
            playing: data.playing,
            volume: data.volume,
          });
          return data;
        } catch (error) {
          console.error('Error fetching room participants:', error);
          set(() => ({
            participants: [],
          }));
        }
      },
    }),
    {
      name: 'room-storage', // unique name
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        roomId: state.roomId,
        joinedRoom: state.joinedRoom,
        avatar: state.avatar,
        nickname: state.nickname,
      }),
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
  const isOwner = !isInJam;
  return {
    isInJam,
    isOwner,
    participants,
  };
};

export const useActiveRoomId = () => {
  const roomId = useRoomStore((state) => state.roomId);
  const joinedRoomId = useRoomStore((state) => state.joinedRoom);
  return joinedRoomId || roomId || 'default'; // default should not happen
};

export const useIsLoggedIn = () => {
  const roomId = useRoomStore((state) => state.roomId);
  const nickname = useRoomStore((state) => state.nickname);
  const avatar = useRoomStore((state) => state.avatar);
  return roomId && nickname && avatar;
};
