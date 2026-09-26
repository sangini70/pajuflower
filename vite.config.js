import { defineConfig } from 'vite';

export default defineConfig({
  root: 'dist',
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: '../vercel-build',
    emptyOutDir: true,
  },
});
