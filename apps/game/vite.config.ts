import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.LSG_API_PROXY_TARGET ?? 'http://localhost:3000';
const usePolling = process.env.LSG_WATCH_POLLING === '1';

export default defineConfig({
  base: '/',
  cacheDir: process.env.LSG_VITE_CACHE_DIR ?? 'node_modules/.vite',
  plugins: [
    VitePWA({
      // The app shows its own "update available" toast and registers the worker itself.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'LSG – Lane Shooting Game',
        short_name: 'LSG',
        description: 'An ad-free 3D lane shooter that runs in your browser.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        orientation: 'any',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        categories: ['games'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell and code are precached; large world media are cached on first use.
        globPatterns: ['**/*.{js,css,html,png,json,webmanifest}'],
        globIgnores: ['media/**/*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/admin/],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/media/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lsg-media-v1',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
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
