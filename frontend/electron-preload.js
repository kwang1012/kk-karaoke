const { contextBridge, ipcRenderer } = require('electron');

// What the pages can reach: media keys pressed in the background, and the floating lyrics window.
contextBridge.exposeInMainWorld('kkaraoke', {
  onMediaKey: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('media-key', listener);
    return () => ipcRenderer.removeListener('media-key', listener);
  },
  // main window -> floating lyrics
  publishMini: (state) => ipcRenderer.send('mini-state', state),
  toggleMini: () => ipcRenderer.send('mini-toggle'),
  // floating lyrics window
  onMiniState: (callback) => ipcRenderer.on('mini-state', (_event, state) => callback(state)),
  miniReady: () => ipcRenderer.send('mini-ready'),
  mediaKey: (action) => ipcRenderer.send('media-key-request', action),
  version: () => ipcRenderer.invoke('app-version'),
});
