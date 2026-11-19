import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Track } from 'src/models/spotify';
import { addOrdered, addSearch, removeSearch } from 'src/searchHistory';

/** What this phone searched for and ordered on the remote, kept on the device (the server only knows signed-in users' orders). */
export const useSearchHistoryStore = create<{
  searches: string[];
  ordered: Track[];
  addOrdered: (track: Track) => void;
  add: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
}>()(
  persist(
    (set) => ({
      searches: [],
      ordered: [],
      addOrdered: (track) => set((state) => ({ ordered: addOrdered(state.ordered, track) })),
      add: (query) => set((state) => ({ searches: addSearch(state.searches, query) })),
      remove: (query) => set((state) => ({ searches: removeSearch(state.searches, query) })),
      clear: () => set({ searches: [] }),
    }),
    { name: 'search-history', storage: createJSONStorage(() => localStorage) }
  )
);
