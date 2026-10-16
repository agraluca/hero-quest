import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // top-level await (model preload in main.ts)
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
