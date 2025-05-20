const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    useContentSize: true,
    width: 1440,
    height: 810,
    webPreferences: {
      // Disable Node integration for security in production
      nodeIntegration: false,
    },
    // remove the default titlebar
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 28 },
  });

  win.loadFile(path.join(__dirname, 'build', 'index.html'));
  if (process.argv.includes('-d')) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
