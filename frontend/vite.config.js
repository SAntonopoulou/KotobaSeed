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
    // Same-origin /api routing — in production Caddy strips /api and forwards
    // to the backend; in dev we replicate that here so the SPA never needs
    // a cross-origin VITE_API_URL and the auth cookie lifecycle matches prod.
    // VITE_PROXY_TARGET lets Playwright point the dev server at a test
    // backend on a non-standard port. Defaults to the dev convention.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/uploads': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Emit source maps so Sentry can deminify stack traces. They're
    // uploaded to Sentry via sentry-cli at build time and NOT served
    // alongside the bundle (nginx config omits them) so end-users
    // never download them. Without source maps every JS error in
    // Sentry reads like `t.handleSubmit (a.js:1:24582)`.
    sourcemap: true,
    rollupOptions: {
      output: {
        // Manual chunking via path matching. The editor (lexical) is
        // intentionally NOT split into its own chunk — splitting it
        // separately from react meant the editor chunk would evaluate
        // before its react dependency was ready in dynamically-imported
        // routes (ArticleEditor is lazy-loaded), throwing
        // "Cannot read properties of undefined (reading 'createContext')".
        // Letting lexical ride along with the lazy route chunk costs a
        // few extra kilobytes on that route and zero on every other one.
        manualChunks(id) {
          if (id.includes('node_modules')) {
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
