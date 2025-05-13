import { create } from 'zustand';

type PlaylistStore = {
  menuOpenStatus: Record<number, boolean>;
  setMenuOpenStatus: (index: number, open: boolean) => void;
};

export const usePlaylistStore = create<PlaylistStore>((set) => ({
  menuOpenStatus: {},
  setMenuOpenStatus: (index: number, open: boolean) =>
    set((state) => ({
      menuOpenStatus: {
        ...state.menuOpenStatus,
        [index]: open,
      },
    })),
}));
