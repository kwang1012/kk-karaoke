const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let backend;

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

app.whenReady().then(() => {
  // Launch backend executable
  const backendPath = path.join(__dirname, 'kkaraoke-backend');
  backend = spawn(backendPath);

  backend.stdout.on('data', (data) => {
    console.log(`[Backend]: ${data}`);
  });

  backend.stderr.on('data', (data) => {
    console.error(`[Backend Error]: ${data}`);
  });

  backend.on('close', (code) => {
    console.log(`Backend exited with code ${code}`);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (backend) backend.kill();
  if (process.platform !== 'darwin') app.quit();
});
