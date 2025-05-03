import { create } from 'zustand';

type AppState = {
  searching: boolean;
  searchValue: string;
  setSearching: (searching: boolean) => void;
  setSearchValue: (value: string) => void;
};
export const useAppStore = create<AppState>((set) => ({
  searching: false,
  searchValue: '',
  setSearching: (searching: boolean) => set({ searching }),
  setSearchValue: (value: string) => set({ searchValue: value }),
}));

export * from './audio';
