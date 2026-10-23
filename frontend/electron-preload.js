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
  // the page's own window buttons (Windows)
  setFullScreen: (on) => ipcRenderer.send('set-fullscreen', !!on),
  windowDrag: (start) => ipcRenderer.send('window-drag', !!start),
  windowControl: (action) => ipcRenderer.send('window-control', action),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on('window-maximized', listener);
    return () => ipcRenderer.removeListener('window-maximized', listener);
  },
  toggleMini: () => ipcRenderer.send('mini-toggle'),
  // floating lyrics window
  onMiniState: (callback) => ipcRenderer.on('mini-state', (_event, state) => callback(state)),
  miniReady: () => ipcRenderer.send('mini-ready'),
  // mini -> main window: set the volume
  miniCommand: (command) => ipcRenderer.send('mini-command', command),
  onMiniCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('mini-command', listener);
    return () => ipcRenderer.removeListener('mini-command', listener);
  },
  mediaKey: (action) => ipcRenderer.send('media-key-request', action),
  getUpdateState: () => ipcRenderer.invoke('update-state'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('update-state', listener);
    return () => ipcRenderer.removeListener('update-state', listener);
  },
  installUpdate: () => ipcRenderer.send('update-install'),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  setProgress: (fraction, playing) => ipcRenderer.send('taskbar-progress', { fraction, playing: !!playing }),
  version: () => ipcRenderer.invoke('app-version'),
});
