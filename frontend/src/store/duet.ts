import { create } from 'zustand';
import type { DuetStart } from 'src/duetSync';

interface DuetState {
  /** The duet this device is playing in, if any. */
  duet: DuetStart | null;
  setDuet: (duet: DuetStart | null) => void;
}

export const useDuetStore = create<DuetState>()((set) => ({
  duet: null,
  setDuet: (duet) => set({ duet }),
}));
