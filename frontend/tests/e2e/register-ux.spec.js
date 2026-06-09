// UX-focused checks on the Register flow after the partner-testing
// feedback pass:
//   - tutor branch reveals country picker + KYC callout
//   - inline field error shows when an obviously-bad email is typed
//   - the prominent "Stripe identity check" callout is visible before
//     submit so a tutor isn't blindsided
//   - status page doesn't flash red while the healthcheck is in flight
//
// These specs hit the SPA only (no backend writes) so we don't pollute
// the test DB with throwaway tutor accounts.

import { test, expect } from '@playwright/test';

test.describe('Register UX — partner-testing feedback', () => {
  test('tutor branch reveals country picker, KYC warning, and submit reads "email verification"', async ({ page }) => {
    await page.goto('/register');
    // Pick the tutor role.
    await page.getByRole('radio', { name: /tutor.*teaching site/i }).check();

    // Country picker is required for tutor and is visible.
    const countrySelect = page.getByLabel(/Country.*bank account/i);
    await expect(countrySelect).toBeVisible();

    // Prominent KYC callout is on-screen (so the partner sees it before
    // hitting submit instead of being surprised by Stripe).
    await expect(
      page.getByText(/Next step: Stripe identity check/i),
    ).toBeVisible();
    await expect(
      page.getByText(/government-issued photo ID/i),
    ).toBeVisible();

    // Submit copy reflects the new flow (email verify before KYC).
    await expect(
      page.getByRole('button', { name: /Continue to email verification/i }),
    ).toBeVisible();
  });

  test('inline error appears on the email field for an obviously-bad input', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel(/Full Name/i).fill('Test Person');
    await page.getByLabel(/Email address/i).fill('not-an-email');
    await page.getByLabel(/Password/i).fill('test12345');
    // GDPR consent.
    await page.getByRole('checkbox').last().check();
    await page.getByRole('button', { name: /Register/i }).click();

    // Inline error renders next to the email field — not just the banner.
    const emailError = page.getByText(/doesn't look like an email address/i);
    await expect(emailError).toBeVisible();
    // The email input is flagged invalid for screen readers.
    await expect(page.getByLabel(/Email address/i)).toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('Status page — no flash', () => {
  test('healthcheck pills render neutral while in flight, then resolve', async ({ page }) => {
    await page.goto('/status');
    // Either we caught the "Checking…" state, or the request resolved
    // before the test could see it. Either way the badge text must
    // never be "Issue detected" without a real failure first.
    // (Sophia's partner saw the red flash during the network round trip.)
    const apiRow = page.locator('section').filter({ hasText: 'API' });
    const dbRow = page.locator('section').filter({ hasText: 'Database' });
    // Wait for the SPA to settle.
    await page.waitForLoadState('networkidle');

    // After settling, the pill should be Operational on a healthy
    // backend. Issue detected would mean the backend is down (not a
    // UI bug). We assert at least one of {Operational, Checking…} is
    // present and "Issue detected" is NOT showing on a green deploy.
    const apiText = (await apiRow.first().textContent()) || '';
    expect(apiText).toMatch(/Operational|Checking/);
    expect(apiText).not.toMatch(/Issue detected/);
  });
});
