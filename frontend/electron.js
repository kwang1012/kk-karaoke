const { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// Packaged builds keep the web build next to this file; `electron .` uses it straight from the project.
const indexHtml = path.join(__dirname, 'build', 'index.html');
const iconPath = path.join(__dirname, isWindows ? 'icon.ico' : 'build/icon-512.png');

let win = null;
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
      preload: path.join(__dirname, 'electron-preload.js'),
    },
    // Remove the default titlebar. On Windows the native minimize/maximize/close buttons stay,
    // drawn over the top bar (which is 48px tall and a drag region).
    titleBarStyle: 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 20, y: 28 } } : {}),
    ...(isWindows
      ? { titleBarOverlay: { color: '#00000000', symbolColor: '#a1a1aa', height: 48 } }
      : {}),
  });

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

function showWindow() {
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
      updater.quitAndInstall();
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

function createTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('KKaraoke');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open KKaraoke', click: showWindow },
      { type: 'separator' },
      { label: 'Play / Pause', click: () => sendMediaKey('toggle') },
      { label: 'Next', click: () => sendMediaKey('next') },
      { label: 'Previous', click: () => sendMediaKey('previous') },
      { type: 'separator' },
      ...(app.isPackaged ? [{ label: `Check for updates (v${app.getVersion()})`, click: checkForUpdatesNow }] : []),
      { label: 'Quit', click: () => app.quit() },
    ])
  );
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

ipcMain.handle('app-version', () => app.getVersion());
