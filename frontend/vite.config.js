import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Accept any host. We want `*.localhost` subdomains so dev mirrors the
    // production multi-tenant routing (e.g. `test.localhost:5173` matches
    // `test.kotobaseed.net` on prod). This is dev-only — vite is never
    // exposed publicly.
    host: true,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Manual chunking via path matching — keeps the initial bundle
        // lean by splitting the heaviest modules into their own files
        // that only load on routes that use them.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('/lexical') || id.includes('/@lexical')) {
              return 'editor';
            }
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/react-router/')
            ) {
              return 'react';
            }
            if (id.includes('/react-icons/')) {
              return 'icons';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
