import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { MLB_ORIGIN, upstreamPath } from './api/_routes';

export default defineConfig({
  // Local dev mirrors the Vercel function in api/mlb.ts.
  server: {
    proxy: {
      '/api/mlb': {
        target: MLB_ORIGIN,
        changeOrigin: true,
        rewrite: (path) => upstreamPath(new URL(path, 'http://x').searchParams) ?? '/invalid',
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Retro Baseball',
        short_name: 'Retro Ball',
        description: '8-bit baseball with live MLB rosters.',
        theme_color: '#1d1d24',
        background_color: '#1d1d24',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The game shell works offline; rosters fall back to the last saved copy.
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        // Live MLB data must never be answered with the app shell.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
});
