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
  /** 0 to 1 */
  volume: number;
  /** True when the original vocal is on (the toggle then reads "Vocal"; otherwise "Karaoke"). */
  vocalOn: boolean;
}

interface UpdateState {
  status: 'idle' | 'downloading' | 'ready';
  version: string | null;
  percent: number;
}

interface Window {
  kkaraoke?: {
    onMediaKey: (callback: (action: 'toggle' | 'next' | 'previous') => void) => () => void;
    version: () => Promise<string>;
    onMiniCommand: (callback: (command: { type: 'volume'; value: number } | { type: 'karaoke' }) => void) => () => void;
    publishMini: (state: MiniLyricsState) => void;
    toggleMini: () => void;
    setFullScreen: (on: boolean) => void;
    getUpdateState: () => Promise<UpdateState>;
    onUpdateState: (callback: (state: UpdateState) => void) => () => void;
    installUpdate: () => void;
    windowDrag: (start: boolean) => void;
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
  };
}
