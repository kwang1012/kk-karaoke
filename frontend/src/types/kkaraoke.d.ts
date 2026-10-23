/** Exposed by electron-preload.js; absent in a browser. */
interface Window {
  kkaraoke?: {
    onMediaKey: (callback: (action: 'toggle' | 'next' | 'previous') => void) => () => void;
    version: () => Promise<string>;
  };
}
