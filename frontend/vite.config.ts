import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';

// The desktop build (`--mode=electron`) would otherwise skip .env.production, and with it the Supabase settings:
// without them the app has no sign-in, and the server refuses songs that still need processing.
const productionEnv = (mode: string) =>
  mode === 'electron'
    ? Object.fromEntries(
        Object.entries(loadEnv('production', __dirname, 'VITE_')).map(([key, value]) => [
          `import.meta.env.${key}`,
          JSON.stringify(value),
        ])
      )
    : {};

// "Add to Home Screen" on iOS reads the manifest the page links as it loads, so /remote needs its own page that
// already links the remote one (start_url /remote); swapping the link from script comes too late.
const remotePage = (mode: string) => ({
  name: 'remote-page',
  closeBundle() {
    if (mode === 'electron') return;
    const out = path.resolve(__dirname, './build');
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const remote = html.replace('href="/manifest.json"', 'href="/manifest-remote.json"');
    if (remote === html) throw new Error('remote-page: no manifest link found in index.html');
    // remote.html, not remote/index.html: it is served at /remote itself, with no redirect to /remote/
    fs.writeFileSync(path.join(out, 'remote.html'), remote);
  },
});

export default defineConfig(({ mode }) => ({
  base: mode === 'electron' ? './' : '/',
  define: productionEnv(mode),
  plugins: [react(), tailwindcss(), remotePage(mode)],
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, './build'),
  },
  server: {
    host: true, // reachable from a phone on the same network
    port: 3000,
    open: true,
  },
}));
