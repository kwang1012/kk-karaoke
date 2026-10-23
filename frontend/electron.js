const { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// Packaged builds keep the web build next to this file; `electron .` uses it straight from the project.
const indexHtml = path.join(__dirname, 'build', 'index.html');
const iconPath = path.join(__dirname, isWindows ? 'icon.ico' : 'build/icon-512.png');

const fs = require('fs');

// A tiny settings file: only "floatingLyricsOnMinimize" so far (on by default, like the Mac app).
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try {
    return { floatingLyricsOnMinimize: true, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return { floatingLyricsOnMinimize: true };
  }
}
function writeSettings(patch) {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch }));
  } catch {
    // not saved: the choice only lasts until the app quits
  }
}

let win = null;
let mini = null;
let lastMini = null;
let tray = null;
let quitting = false;

// Media keys: pressed anywhere in Windows, forwarded to the page, which owns the player.
const MEDIA_KEYS = {
  MediaPlayPause: 'toggle',
  MediaNextTrack: 'next',
  MediaPreviousTrack: 'previous',
};

function createWindow() {
  win = new BrowserWindow({
    useContentSize: true,
    width: 1440,
    height: 810,
    minWidth: 900,
    minHeight: 560,
    icon: iconPath,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      // Disable Node integration for security in production
      nodeIntegration: false,
      contextIsolation: true,
      // the window can sit hidden in the tray while a song plays: keep its timers and lyrics running
      backgroundThrottling: false,
      preload: path.join(__dirname, 'electron-preload.js'),
    },
    // Remove the default titlebar. The Mac keeps its traffic lights; on Windows the page draws its own
    // minimize/maximize/close buttons in the top bar (a drag region), driven over IPC (see 'window-control').
    ...(isWindows ? { frame: false } : { titleBarStyle: 'hidden' }),
    ...(isMac ? { trafficLightPosition: { x: 20, y: 28 } } : {}),
  });
  // Like the Mac app: minimizing the main window opens the floating lyrics, restoring it closes them.
  win.on('minimize', () => {
    if (readSettings().floatingLyricsOnMinimize && !(mini && !mini.isDestroyed())) toggleMini();
  });
  win.on('restore', () => {
    if (mini && !mini.isDestroyed()) mini.close();
  });
  win.on('maximize', () => win.webContents.send('window-maximized', true));
  win.on('unmaximize', () => win.webContents.send('window-maximized', false));

  win.loadFile(indexHtml);
  if (process.argv.includes('-d')) {
    win.webContents.openDevTools();
  }

  // Links that leave the app (a song's source, a donation page) open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Closing the window on Windows keeps the song playing from the tray; Quit in the tray menu exits.
  win.on('close', (event) => {
    if (isWindows && !quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

// Floating lyrics: a small always-on-top window. The main window owns the player and sends it the state.
// Only one of the two is on screen at a time: opening floating lyrics tucks the main window away (it keeps
// playing), and closing them, or opening the app, swaps back.
function toggleMini() {
  if (mini && !mini.isDestroyed()) {
    showWindow();
    return;
  }
  const { workArea } = require('electron').screen.getPrimaryDisplay();
  const width = 580;
  const height = 170;
  mini = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - 24,
    minWidth: 500,
    minHeight: 130,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    icon: iconPath,
    backgroundColor: '#16121f',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'electron-preload.js') },
  });
  mini.setAlwaysOnTop(true, 'floating');
  mini.loadFile(path.join(__dirname, 'build', 'mini-lyrics.html'));
  mini.on('closed', () => {
    mini = null;
    if (!quitting && win && !win.isDestroyed() && !win.isVisible()) showWindow();
  });
  if (win && !win.isDestroyed() && !win.isMinimized()) win.hide();
}

function showWindow() {
  if (mini && !mini.isDestroyed()) mini.close();
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendMediaKey(action) {
  if (win && !win.isDestroyed()) win.webContents.send('media-key', action);
}

// Over-the-air updates (Windows): the installer and latest.yml are published to updates.kkaraoke.app/windows
// (see scripts/publish-windows.sh). A new version downloads in the background; nothing restarts mid-song,
// the user picks when, or it installs the next time the app quits.
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000;
let updater = null;

function setupUpdates() {
  if (!isWindows || !app.isPackaged) return;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('error', (error) => console.error('update check failed:', error?.message || error));
  updater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 1,
      cancelId: 1,
      title: 'Update ready',
      message: `KKaraoke ${info.version} is ready to install.`,
      detail: 'Restart to update now, or it installs the next time you quit KKaraoke.',
    });
    if (response === 0) {
      quitting = true;
      // silent: no installer window, and the app reopens by itself
      updater.quitAndInstall(true, true);
    }
  });
  const check = () => updater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_CHECK_MS);
}

async function checkForUpdatesNow() {
  if (!updater) return;
  try {
    const result = await updater.checkForUpdates();
    if (!result?.isUpdateAvailable) {
      dialog.showMessageBox({ type: 'info', message: 'KKaraoke is up to date.', detail: `Version ${app.getVersion()}` });
    }
  } catch {
    dialog.showMessageBox({ type: 'error', message: 'Could not check for updates.', detail: 'Check your connection and try again.' });
  }
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open KKaraoke', click: showWindow },
    { type: 'separator' },
    { label: 'Floating lyrics', click: toggleMini },
    {
      label: 'Floating lyrics when minimized',
      type: 'checkbox',
      checked: readSettings().floatingLyricsOnMinimize,
      click: (item) => writeSettings({ floatingLyricsOnMinimize: item.checked }),
    },
    { label: 'Play / Pause', click: () => sendMediaKey('toggle') },
    { label: 'Next', click: () => sendMediaKey('next') },
    { label: 'Previous', click: () => sendMediaKey('previous') },
    { type: 'separator' },
    ...(app.isPackaged ? [{ label: `Check for updates (v${app.getVersion()})`, click: checkForUpdatesNow }] : []),
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('KKaraoke');
  tray.setContextMenu(trayMenu());
  tray.on('click', showWindow);
}

// One window: opening the app again brings the first one back.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    if (isWindows) {
      app.setAppUserModelId('app.kkaraoke.desktop');
      Menu.setApplicationMenu(null);
      createTray();
    }
    createWindow();
    setupUpdates();
    for (const [key, action] of Object.entries(MEDIA_KEYS)) {
      globalShortcut.register(key, () => sendMediaKey(action));
    }
  });

  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('activate', showWindow);
  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}

ipcMain.on('mini-state', (_event, state) => {
  lastMini = state;
  if (mini && !mini.isDestroyed()) mini.webContents.send('mini-state', state);
});
ipcMain.on('mini-ready', () => {
  if (lastMini && mini && !mini.isDestroyed()) mini.webContents.send('mini-state', lastMini);
});
ipcMain.on('mini-toggle', toggleMini);
ipcMain.on('mini-command', (_event, command) => {
  if (!command || !win || win.isDestroyed()) return;
  if (command.type === 'karaoke') {
    win.webContents.send('mini-command', { type: 'karaoke' });
  } else if (command.type === 'volume' && Number.isFinite(Number(command.value))) {
    win.webContents.send('mini-command', { type: 'volume', value: Math.min(1, Math.max(0, Number(command.value))) });
  }
});
// The page's own window buttons (Windows).
ipcMain.on('window-control', (_event, action) => {
  if (!win || win.isDestroyed()) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
  else if (action === 'close') win.close();
});
ipcMain.handle('window-is-maximized', () => !!win && !win.isDestroyed() && win.isMaximized());
ipcMain.on('media-key-request', (_event, action) => {
  if (action in { toggle: 1, next: 1, previous: 1 }) sendMediaKey(action);
});

ipcMain.handle('app-version', () => app.getVersion());
