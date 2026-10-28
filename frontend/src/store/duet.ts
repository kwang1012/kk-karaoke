import { create } from 'zustand';
import type { DuetStart } from 'src/duetSync';
import type { DuetPart, DuetSession } from 'src/duetSession';

/** Names this tab to the room: two tabs of one browser are two members, as each plays its own audio. */
const memberId = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

interface DuetState {
  memberId: string;
  /** What the room says: a lobby people are getting ready in, or a song they are singing. */
  session: DuetSession | null;
  setSession: (session: DuetSession | null) => void;
  /** This device closed the lobby without joining. Forgotten when the session ends. */
  declined: boolean;
  setDeclined: (declined: boolean) => void;
  /** The part this device sings of a song with two. */
  part: DuetPart;
  setPart: (part: DuetPart) => void;
  /** The start this device is playing from, from the first play until the session ends. */
  duet: DuetStart | null;
  setDuet: (duet: DuetStart | null) => void;
  /** The browser is holding this device's audio until the person touches the page. */
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

export const useDuetStore = create<DuetState>()((set) => ({
  memberId,
  session: null,
  setSession: (session) => set({ session }),
  declined: false,
  setDeclined: (declined) => set({ declined }),
  part: 0,
  setPart: (part) => set({ part }),
  duet: null,
  setDuet: (duet) => set({ duet }),
  locked: false,
  setLocked: (locked) => set({ locked }),
}));

/** Singing now or paused mid-song (not just getting ready). */
export const useIsSinging = () => useDuetStore((state) => !!state.session && state.session.phase !== 'lobby');
