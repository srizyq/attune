import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5183,
  },
  // Generous timeouts: the SQL tests boot an in-process Postgres and every
  // component test spins up jsdom, so on a busy machine (or CI) the 5s default
  // fails tests that are merely slow, not broken.
  test: {
    testTimeout: 30000,
    hookTimeout: 120000,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom service worker (src/sw.js) instead of the fully-generated
      // one — needed to handle 'push' and 'notificationclick' events for
      // reminder notifications, which generateSW mode has no hook for.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Attune',
        short_name: 'Attune',
        description: 'Track food. Feel the pattern. Attune connects what you eat to how you feel.',
        theme_color: '#0f0f0f',
        background_color: '#0f0f0f',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
