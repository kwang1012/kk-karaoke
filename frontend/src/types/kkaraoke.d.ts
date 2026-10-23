/** Exposed by electron-preload.js; absent in a browser. */
interface MiniLyricsState {
  title?: string;
  artist?: string;
  line?: string;
  next?: string;
  /** Shown instead of lyrics: nothing playing, or no lyrics for the song. */
  message?: string;
  /** False before the first line is sung. */
  current?: boolean;
  playing: boolean;
}

interface Window {
  kkaraoke?: {
    onMediaKey: (callback: (action: 'toggle' | 'next' | 'previous') => void) => () => void;
    version: () => Promise<string>;
    publishMini: (state: MiniLyricsState) => void;
    toggleMini: () => void;
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
  };
}
