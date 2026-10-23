const { contextBridge, ipcRenderer } = require('electron');

// The only thing the page can reach: media keys pressed while the window is in the background.
contextBridge.exposeInMainWorld('kkaraoke', {
  onMediaKey: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('media-key', listener);
    return () => ipcRenderer.removeListener('media-key', listener);
  },
  version: () => ipcRenderer.invoke('app-version'),
});
