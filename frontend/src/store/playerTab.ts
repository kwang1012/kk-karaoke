import { create } from 'zustand';

/**
 * A room has one player: the tab that plays the audio and reports its position to everyone else.
 * Two tabs of the same user used to both act as the owner, so both played audio and both announced
 * their own position (a tab that had not started yet announced 0, and every guest briefly jumped
 * to 0 before the real player's next update corrected it).
 *
 * The Web Locks API picks the player: the first tab holds an exclusive lock per room, later tabs
 * wait for it. When the player tab closes the next one takes over; "Play here" steals the lock.
 * Without the API (an insecure page such as a LAN address) every tab stays a player, as before.
 */
const supported = typeof navigator !== 'undefined' && 'locks' in navigator;

interface PlayerTabState {
  /** whether this tab is the one that plays audio for its room */
  isPlayerTab: boolean;
}

export const usePlayerTabStore = create<PlayerTabState>(() => ({ isPlayerTab: !supported }));

let release: (() => void) | null = null;
let currentRoom: string | null = null;

const lockName = (roomId: string) => `kk-player:${roomId}`;

function request(roomId: string, steal: boolean) {
  if (!supported) return;
  navigator.locks
    .request(lockName(roomId), { steal }, () => {
      if (currentRoom !== roomId) return; // moved on to another room while waiting
      usePlayerTabStore.setState({ isPlayerTab: true });
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    })
    .catch(() => {
      // another tab stole the lock: we are a remote now, but wait in line to take over again
      if (currentRoom === roomId) {
        usePlayerTabStore.setState({ isPlayerTab: false });
        request(roomId, false);
      }
    });
}

/**
 * Start competing to be the player for a room you own (call when it changes; returns a cleanup).
 * Pass null when you are only a guest: guests never play audio, so they take no part.
 */
export function claimPlayerTab(roomId: string | null) {
  if (!supported || roomId === null) return () => {};
  currentRoom = roomId;
  usePlayerTabStore.setState({ isPlayerTab: false });
  request(roomId, false);
  return () => {
    if (currentRoom === roomId) currentRoom = null;
    release?.();
    release = null;
  };
}

/** Make this tab the player, taking over from whichever tab has it now. */
export function takeOverPlayback() {
  if (currentRoom) request(currentRoom, true);
}
