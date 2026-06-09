// Prod-targeted Playwright config — hits live kotobaseed.net and the
// vasso/dafni subdomains. No webServer; no test DB; tests are designed
// not to mutate prod state.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['launch-readiness-prod.spec.js'],
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://kotobaseed.net',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: false,
  },
});
