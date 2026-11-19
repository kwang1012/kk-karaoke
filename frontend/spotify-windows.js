// Runs spotify-windows.ps1 and relays what it says about the Spotify desktop app (Windows only).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const RESTART_DELAYS_MS = [2000, 5000, 15000, 30000];

/**
 * @param {{ app: import('electron').App, send: (state: object) => void, readSettings: () => object, writeSettings: (patch: object) => void }} deps
 */
function createSpotifyBridge({ app, send, readSettings, writeSettings }) {
  let child = null;
  let wanted = false;
  let restarts = 0;
  let nextId = 1;
  const waiting = new Map(); // command id -> resolve
  let latest = null;

  const available = process.platform === 'win32';

  function write(command) {
    if (!child || child.killed || !child.stdin.writable) return false;
    child.stdin.write(JSON.stringify(command) + '\n');
    return true;
  }

  function handle(message) {
    if (message.type === 'state') {
      latest = message;
      send(message);
    } else if (message.type === 'position') {
      const resolve = waiting.get(message.id);
      if (resolve) {
        waiting.delete(message.id);
        resolve(message.position);
      }
    } else if (message.type === 'volume') {
      // kept on disk: a crash while Spotify is muted must not leave it silent for good
      writeSettings({ spotifyVolume: message.saved });
    } else if (message.type === 'error') {
      console.warn('Spotify helper:', message.message);
    }
  }

  function launch() {
    // A script on disk, not -Command: its length is not limited, and the profile and policy stay out of the way.
    const script = path.join(app.getPath('userData'), 'spotify-helper.ps1');
    fs.writeFileSync(script, fs.readFileSync(path.join(__dirname, 'spotify-windows.ps1'), 'utf8'));
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          handle(JSON.parse(line));
        } catch {
          // not JSON: PowerShell's own noise
        }
      }
    });
    child.stderr.on('data', (chunk) => console.warn('Spotify helper:', String(chunk).trim()));
    child.on('error', (error) => console.warn('Spotify helper did not start:', error.message));
    child.on('exit', () => {
      child = null;
      for (const resolve of waiting.values()) resolve(null);
      waiting.clear();
      if (!wanted) return;
      const delay = RESTART_DELAYS_MS[Math.min(restarts++, RESTART_DELAYS_MS.length - 1)];
      setTimeout(() => wanted && !child && launch(), delay);
    });
    const saved = readSettings().spotifyVolume;
    // Spotify left muted by a crash: give its sound back before anything else
    if (typeof saved === 'number') {
      write({ cmd: 'restore', volume: saved });
      writeSettings({ spotifyVolume: null });
    }
  }

  return {
    available,
    start() {
      if (!available) return false;
      wanted = true;
      restarts = 0;
      if (!child) launch();
      else if (latest) send(latest);
      return true;
    },
    stop() {
      wanted = false;
      if (!child) return;
      write({ cmd: 'unmute' });
      writeSettings({ spotifyVolume: null });
      const closing = child;
      closing.stdin.end();
      setTimeout(() => closing.kill(), 1500);
    },
    /** 'mute' | 'unmute' | 'pause' | 'play' | 'next', or 'position', which answers seconds into the song (or null). */
    command(name) {
      if (name === 'position') {
        return new Promise((resolve) => {
          const id = nextId++;
          waiting.set(id, resolve);
          if (!write({ cmd: 'position', id })) return resolve(null);
          setTimeout(() => waiting.delete(id) && resolve(null), 3000);
        });
      }
      if (!['mute', 'unmute', 'pause', 'play', 'next'].includes(name)) return Promise.resolve(false);
      return Promise.resolve(write({ cmd: name }));
    },
  };
}

module.exports = { createSpotifyBridge };
