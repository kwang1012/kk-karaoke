import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
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

export default defineConfig(({ mode }) => ({
  base: mode === 'electron' ? './' : '/',
  define: productionEnv(mode),
  plugins: [react(), tailwindcss()],
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
