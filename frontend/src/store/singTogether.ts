import { create } from 'zustand';
import type { Standing } from 'src/party';
import type { Result } from 'src/scoring';

/** The three ways of singing together: phones as mics in one room, friends on a call, or a recording sent to a friend. */
export type SingMode = 'room' | 'call' | 'record';
/** Which page of the Sing together dialog is showing. */
export type SingStep = 'choose' | 'room' | 'call';
export type SingPhase = 'setup' | 'singing' | 'results';

/** How a song sung together ended: everyone's standing (in one room), or this device's own score (on a call). */
export type SingEnding =
  | { kind: 'party'; song: string; standings: Standing[]; partial: boolean }
  | { kind: 'solo'; song: string; result: Result | null; saved: boolean; partial: boolean };

type SingTogetherState = {
  open: boolean;
  step: SingStep;
  mode: SingMode | null;
  phase: SingPhase | null;
  /** Bumped to score a song again from the start (Sing again). */
  round: number;
  ending: SingEnding | null;
  /** Set by the pitch roll: scores what has been sung so far; `partial` when the song was stopped before its end. */
  finisher: ((partial: boolean) => void) | null;
  show: (step?: SingStep) => void;
  hide: () => void;
  setStep: (step: SingStep) => void;
  start: (mode: SingMode, phase: SingPhase) => void;
  setPhase: (phase: SingPhase | null) => void;
  nextRound: () => void;
  setEnding: (ending: SingEnding | null) => void;
  setFinisher: (finisher: ((partial: boolean) => void) | null) => void;
  /** Stops singing together altogether. */
  reset: () => void;
};

export const useSingTogether = create<SingTogetherState>()((set) => ({
  open: false,
  step: 'choose',
  mode: null,
  phase: null,
  round: 0,
  ending: null,
  finisher: null,
  show: (step) => set((state) => ({ open: true, step: step ?? (state.mode === 'room' ? 'room' : 'choose') })),
  hide: () => set({ open: false }),
  setStep: (step) => set({ step }),
  start: (mode, phase) => set({ mode, phase }),
  setPhase: (phase) => set({ phase }),
  nextRound: () => set((state) => ({ round: state.round + 1, ending: null })),
  setEnding: (ending) => set(ending ? { ending, phase: 'results' } : { ending: null }),
  setFinisher: (finisher) => set({ finisher }),
  reset: () => set({ open: false, step: 'choose', mode: null, phase: null, ending: null }),
}));

/** Opens the Sing together dialog: where it all starts. */
export const openSingTogether = () => useSingTogether.getState().show();
