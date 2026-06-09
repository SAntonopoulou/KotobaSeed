// Playwright config for Kotobaseed end-to-end browser tests.
//
// The webServer config boots both the backend (via the shell script,
// which avoids a Playwright-vs-Python subprocess SQLite quirk) and the
// Vite dev server. Run the suite with `npx playwright test` from the
// `frontend/` directory.
import { defineConfig } from '@playwright/test';

const BACKEND_PORT = Number(process.env.PLAYWRIGHT_BACKEND_PORT || 8765);
const FRONTEND_PORT = 5174;

// PROD=1 disables the local backend/frontend webServer boot — the
// prod-readiness specs hit https://kotobaseed.net directly and don't
// need (or want) a local dev stack stealing the port.
const PROD = !!process.env.PROD;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: PROD ? 'https://kotobaseed.net' : `http://localhost:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: PROD ? undefined : [
    {
      // Run the backend through the shell script. The script sets up
      // its env, wipes the test DB, then execs uvicorn — same path a
      // dev would take manually, which is what makes SQLite happy.
      command: `bash tests/e2e/start-backend.sh`,
      url: `http://127.0.0.1:${BACKEND_PORT}/healthz`,
      reuseExistingServer: !!process.env.PLAYWRIGHT_REUSE_BACKEND,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `VITE_PROXY_TARGET=http://localhost:${BACKEND_PORT} npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
      port: FRONTEND_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
