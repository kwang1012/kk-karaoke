import { create } from 'zustand';
import type { DuetStart } from 'src/duetSync';

interface DuetState {
  /** The duet this device is playing in, if any. */
  duet: DuetStart | null;
  setDuet: (duet: DuetStart | null) => void;
  /** The browser is holding this device's audio until the person touches the page. */
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

export const useDuetStore = create<DuetState>()((set) => ({
  duet: null,
  setDuet: (duet) => set({ duet }),
  locked: false,
  setLocked: (locked) => set({ locked }),
}));
