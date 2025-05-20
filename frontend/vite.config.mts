import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => ({
  base: mode === 'electron' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      filename: 'build/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, './build'),
  },
}));
