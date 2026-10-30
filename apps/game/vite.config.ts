import fs from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.LSG_API_PROXY_TARGET ?? 'http://localhost:3000';
const usePolling = process.env.LSG_WATCH_POLLING === '1';
const packageVersion = (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }).version;
/** Identifies a build; the deploy script passes the commit, local builds use the build time. */
const buildId = process.env.LSG_BUILD_ID || `local-${Date.now().toString(36)}`;

export default defineConfig({
  base: '/',
  define: {
    __LSG_VERSION__: JSON.stringify(packageVersion),
    __LSG_BUILD__: JSON.stringify(buildId),
  },
  cacheDir: process.env.LSG_VITE_CACHE_DIR ?? 'node_modules/.vite',
  plugins: [
    {
      // The running game polls this file to learn that a newer build is online.
      name: 'lsg-version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: packageVersion, build: buildId }),
        });
      },
    },
    VitePWA({
      // The app shows its own "update available" toast and registers the worker itself.
      registerType: 'prompt',
      injectRegister: false,
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
        globIgnores: ['version.json'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/admin/],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Hashed file names make these safe to keep: a changed file has a new URL.
            urlPattern: ({ url }) => /^\/assets\/.+\.(hdr|jpg|ogg|m4a|mp3|glb|ktx2)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lsg-media-v2',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 90 },
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
