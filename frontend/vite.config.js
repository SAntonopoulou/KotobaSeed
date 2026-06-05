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
})
