import { defineConfig } from 'vite';

const apiTarget = process.env.LSG_API_PROXY_TARGET ?? 'http://localhost:3000';
const usePolling = process.env.LSG_WATCH_POLLING === '1';

export default defineConfig({
  base: '/',
  cacheDir: process.env.LSG_VITE_CACHE_DIR ?? 'node_modules/.vite',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
});
