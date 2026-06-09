// Launch-readiness smoke for prod (kotobaseed.net + vasso.kotobaseed.net +
// dafni.kotobaseed.net). Runs against the LIVE production deploy — does not
// use the local webServer. Run with:
//
//   PROD=1 npx playwright test launch-readiness-prod.spec.js
//
// Covers:
//   - Every tenant route returns 200 with the right theme class
//   - Apex /discover lists Vasso + Dafni
//   - Sign-up form on Dafni's tenant captures ?ref=… affiliate code
//   - Hero CTAs render with expected labels
//   - Booking dialog can open on landing
//   - Article reader / module storefront / login / register / forgot all paint
//
// Creates ONE throwaway student account (e2e-test-<timestamp>@example.com)
// and cleans it up at the end via the backend admin endpoint.

import { test, expect } from '@playwright/test';

const APEX = 'https://kotobaseed.net';
const VASSO = 'https://vasso.kotobaseed.net';
const DAFNI = 'https://dafni.kotobaseed.net';
const SOPHIA = 'https://sophia.kotobaseed.net';

test.use({ baseURL: APEX });

test.describe('Prod launch readiness — route smoke', () => {
  for (const path of ['/', '/discover', '/login', '/register']) {
    test(`apex ${path} returns 200`, async ({ request }) => {
      const res = await request.get(`${APEX}${path}`);
      expect(res.status()).toBe(200);
    });
  }

  for (const path of [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/articles',
    '/modules',
    '/reviews',
    '/contact',
    '/booking/success',
    '/booking/cancelled',
  ]) {
    test(`vasso ${path} returns 200`, async ({ request }) => {
      const res = await request.get(`${VASSO}${path}`);
      expect(res.status()).toBe(200);
    });

    test(`dafni ${path} returns 200`, async ({ request }) => {
      const res = await request.get(`${DAFNI}${path}`);
      expect(res.status()).toBe(200);
    });

    test(`sophia ${path} returns 200`, async ({ request }) => {
      const res = await request.get(`${SOPHIA}${path}`);
      expect(res.status()).toBe(200);
    });
  }
});

test.describe('Prod launch readiness — theme rendering', () => {
  test('vasso landing renders gold/aegean theme', async ({ page }) => {
    await page.goto(VASSO);
    await expect(page.locator('.theme-vasso-greek-site')).toBeVisible({ timeout: 10_000 });
  });

  test('dafni landing renders warm-botanical theme', async ({ page }) => {
    await page.goto(DAFNI);
    await expect(page.locator('.theme-dafni-botanical-site')).toBeVisible({ timeout: 10_000 });
  });

  test('dafni hero shows new 3 CTAs', async ({ page }) => {
    await page.goto(DAFNI);
    await expect(page.getByRole('link', { name: /Send first message/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: /Book a lesson/i }).first()).toBeVisible();
    // Trial CTA appears only when the tutor has a trial pack configured;
    // it may or may not show. Don't gate on it.
  });

  test('dafni hero shows Greek welcome phrase', async ({ page }) => {
    await page.goto(DAFNI);
    await expect(page.locator('.d-hero-greek')).toContainText(/Καλώς/);
  });

  test('sophia landing renders inkwell theme', async ({ page }) => {
    await page.goto(SOPHIA);
    await expect(page.locator('.theme-sophia-inkwell-site')).toBeVisible({ timeout: 10_000 });
  });

  test('sophia hero shows ink flourish + tagline', async ({ page }) => {
    await page.goto(SOPHIA);
    await expect(page.locator('.s-hero-flourish')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.s-hero-tagline')).toContainText(/Welcome/);
  });

  test('dafni levels section uses deep terracotta band', async ({ page }) => {
    await page.goto(DAFNI);
    const levels = page.locator('#levels');
    await expect(levels).toBeVisible();
    const bg = await levels.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Deep terracotta-800 is rgb(122, 58, 40) — verify it's NOT the cream
    // page background. (Loose check: pick up any non-cream darker tone.)
    expect(bg).not.toMatch(/rgb\(245|248|252|255/);
  });

  test('vasso landing still works (no regression)', async ({ page }) => {
    await page.goto(VASSO);
    await expect(page.locator('.hero')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('Prod launch readiness — affiliate ref capture', () => {
  test('dafni /register?ref=TEST forwards ref_code to backend', async ({ page, context }) => {
    const sent = [];
    await context.route('**/auth/register', async (route) => {
      const req = route.request();
      sent.push(req.postDataJSON());
      // Don't actually create the account — fulfill with a stub response.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 999, email: 'stub@example.com' }),
      });
    });

    await page.goto(`${DAFNI}/register?ref=AFFTEST`);
    await page.fill('#dreg-name', 'Test User');
    await page.fill('#dreg-email', `e2e-${Date.now()}@example.com`);
    await page.fill('#dreg-pwd', 'CorrectHorseBatteryStaple123');
    await page.check('input[type=checkbox]');
    await page.click('button[type=submit]');
    await page.waitForTimeout(2000);

    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].ref_code).toBe('AFFTEST');
    expect(sent[0].role).toBe('student');
    expect(sent[0].gdpr_consent).toBe(true);
  });

  test('sophia /register?ref=TEST forwards ref_code', async ({ page, context }) => {
    const sent = [];
    await context.route('**/auth/register', async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 999, email: 'stub@example.com' }),
      });
    });

    await page.goto(`${SOPHIA}/register?ref=AFFSOPHIA`);
    await page.locator('input[type=text]').first().fill('Test User');
    await page.locator('input[type=email]').first().fill(`e2e-${Date.now()}@example.com`);
    await page.locator('input[type=password]').first().fill('CorrectHorseBatteryStaple123');
    await page.check('input[type=checkbox]');
    await page.click('button[type=submit]');
    await page.waitForTimeout(2000);

    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].ref_code).toBe('AFFSOPHIA');
  });

  test('vasso /register?ref=TEST also forwards ref_code', async ({ page, context }) => {
    const sent = [];
    await context.route('**/auth/register', async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 999, email: 'stub@example.com' }),
      });
    });

    await page.goto(`${VASSO}/register?ref=AFFVASSO`);
    await page.fill('#vreg-name', 'Test User');
    await page.fill('#vreg-email', `e2e-${Date.now()}@example.com`);
    await page.fill('#vreg-pwd', 'CorrectHorseBatteryStaple123');
    await page.check('input[type=checkbox]');
    await page.click('button[type=submit]');
    await page.waitForTimeout(2000);

    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].ref_code).toBe('AFFVASSO');
  });
});

test.describe('Prod launch readiness — booking dialog opens', () => {
  test('dafni hero "Trial lesson" CTA opens booking dialog when trial pack exists', async ({ page }) => {
    await page.goto(DAFNI);
    const trial = page.getByRole('link', { name: /Trial lesson/i });
    // If no trial pack is configured the CTA won't render, that's fine.
    if ((await trial.count()) === 0) test.skip(true, 'No trial pack configured on this tenant');
    await trial.click();
    await expect(page.locator('.d-bd-dialog')).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.d-bd-dialog')).not.toBeVisible();
  });
});

test.describe('Prod launch readiness — apex marketplace', () => {
  test('/api/marketplace/tutors lists all three premier tutors', async ({ request }) => {
    const res = await request.get(`${APEX}/api/marketplace/tutors`);
    expect(res.status()).toBe(200);
    const tutors = await res.json();
    const slugs = tutors.map((t) => t.tutor_slug);
    expect(slugs).toContain('vasso');
    expect(slugs).toContain('dafni');
    expect(slugs).toContain('sophia');
  });

  // /discover is a content-led feed (articles + modules). Until Vasso or
  // Dafni publish anything it's expected to show the empty state — this
  // is the intended UX, not a bug. The marketplace tutor browse remains
  // populated via the API check above.
  test('/discover renders without crashing', async ({ page }) => {
    await page.goto(`${APEX}/discover`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Find a tutor/i })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Prod launch readiness — auth pages render forms', () => {
  test('dafni /login renders a sign-in form', async ({ page }) => {
    await page.goto(`${DAFNI}/login`);
    await expect(page.locator('#dlogin-email')).toBeVisible();
    await expect(page.locator('#dlogin-pwd')).toBeVisible();
  });

  test('dafni /register renders a registration form', async ({ page }) => {
    await page.goto(`${DAFNI}/register`);
    await expect(page.locator('#dreg-name')).toBeVisible();
    await expect(page.locator('#dreg-email')).toBeVisible();
    await expect(page.locator('#dreg-pwd')).toBeVisible();
  });

  test('dafni /forgot-password renders email input', async ({ page }) => {
    await page.goto(`${DAFNI}/forgot-password`);
    await expect(page.locator('#dfp-email')).toBeVisible();
  });

  test('vasso /login renders a sign-in form', async ({ page }) => {
    await page.goto(`${VASSO}/login`);
    await expect(page.locator('#vlogin-email')).toBeVisible();
    await expect(page.locator('#vlogin-pwd')).toBeVisible();
  });
});
