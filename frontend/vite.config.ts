import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ mode }) => ({
  base: mode === 'electron' ? './' : '/',
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
    port: 3000,
    open: true,
  },
}));
