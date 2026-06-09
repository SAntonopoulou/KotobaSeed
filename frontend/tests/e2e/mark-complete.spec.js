// Slice A verification: tutors can't mark a lesson complete or flag it
// as a no-show before the timing windows allow it.
//
// The backend is the source of truth for both gates; this spec calls
// the API directly through Playwright's request fixture (rather than
// driving the full BookingsManager UI) so it stays fast and
// independent of the dashboard's rendering details. The UI-level
// affordances (disabled tooltips) are covered by the visual-regression
// pass on the BookingsManager later.
import { test, expect } from '@playwright/test';
import { apiJson, registerStudent, registerTutor } from './helpers.js';

// We can't easily pre-confirm a paid booking through Stripe in tests,
// so we exercise the trial path which lands as CONFIRMED directly.
async function setupTrialEnabled(request, tutorSlug, tutorToken) {
  // Open one window so trials can be booked.
  await apiJson(request, '/tutor/availability', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tutorToken}`,
      'X-Tenant-Slug': tutorSlug,
    },
    data: {
      windows: [
        { weekday: 0, start_minute: 0, end_minute: 1440, allow_trial: true },
        { weekday: 1, start_minute: 0, end_minute: 1440, allow_trial: true },
        { weekday: 2, start_minute: 0, end_minute: 1440, allow_trial: true },
        { weekday: 3, start_minute: 0, end_minute: 1440, allow_trial: true },
        { weekday: 4, start_minute: 0, end_minute: 1440, allow_trial: true },
        { weekday: 5, start_minute: 0, end_minute: 1440, allow_trial: true },
        { weekday: 6, start_minute: 0, end_minute: 1440, allow_trial: true },
      ],
    },
  });
  await apiJson(request, '/tutor/trial', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tutorToken}`,
      'X-Tenant-Slug': tutorSlug,
    },
    data: { offers_free_trial: true, free_trial_minutes: 15 },
  });
}

test.describe('Mark complete + no-show timing gates', () => {
  let tutorToken;
  let studentToken;
  let bookingId;
  const tutorSlug = `t${Date.now().toString(36).slice(-6)}`;

  test.beforeAll(async ({ request }) => {
    const stamp = Date.now().toString(36).slice(-6);
    const tutor = await registerTutor(
      request,
      `tutor-${stamp}@example.com`,
      tutorSlug,
    );
    tutorToken = tutor.access_token;
    // Test mode: sync flips PAUSED_KYC → ACTIVE because the stubbed
    // Stripe fetch returns charges/payouts enabled.
    await apiJson(request, '/onboarding/tutor/sync-stripe', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tutorToken}` },
    });
    await setupTrialEnabled(request, tutorSlug, tutorToken);

    const student = await registerStudent(
      request,
      `student-${stamp}@example.com`,
    );
    studentToken = student.access_token;

    // Book a trial 5 minutes from now so the lesson is in the immediate
    // future. Backend uses min_booking_lead_minutes=120 by default;
    // relax to 0 first so a 5-minute-out trial slot is bookable.
    await apiJson(request, '/tutor/me', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tutorToken}`,
        'X-Tenant-Slug': tutorSlug,
      },
      data: { min_booking_lead_minutes: 0 },
    });

    const slotIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const created = await apiJson(request, '/tutor/trial/book', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'X-Tenant-Slug': tutorSlug,
      },
      data: { scheduled_at: slotIso },
    });
    bookingId = created.booking_id || created.id;
  });

  test('cannot mark complete while the lesson is still in the future', async ({ request }) => {
    const res = await request.fetch(`/api/tutor/bookings/${bookingId}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tutorToken}`,
        'X-Tenant-Slug': tutorSlug,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/ends at/i);
  });

  test('cannot flag no-show inside the 15-minute grace period', async ({ request }) => {
    const res = await request.fetch(`/api/tutor/bookings/${bookingId}/no-show`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tutorToken}`,
        'Content-Type': 'application/json',
        'X-Tenant-Slug': tutorSlug,
      },
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/15 minutes after start/);
  });
});
