// Sanity check that the Playwright harness is wired up.
// The actual flow specs live alongside this file.
import { test, expect } from '@playwright/test';
import { apiJson } from './helpers.js';

test('backend healthz responds via the Vite proxy', async ({ request }) => {
  const data = await apiJson(request, '/healthz');
  expect(data.ok).toBe(true);
});

test('landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Kotoba/i);
});
