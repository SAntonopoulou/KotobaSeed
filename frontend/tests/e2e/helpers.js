// Shared helpers for Playwright specs.
//
// `api` — fetch wrapper that always hits the Vite proxy (so cookies +
// CORS behaviour match the SPA exactly).
// `registerStudent`, `registerTutor`, `createBooking` — seed routines
// that go through the real API so we exercise the same validation path
// the SPA would.
// `loginViaForm` — drives the actual login form in the browser instead
// of hitting `/auth/token` directly; matters for SSO behaviour
// assertions because the form is what stamps localStorage.

const API_BASE = '/api';

const apiFetch = async (request, path, opts = {}) => {
  const res = await request.fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  return res;
};

export const apiJson = async (request, path, opts = {}) => {
  const res = await apiFetch(request, path, opts);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`API ${opts.method || 'GET'} ${path} → ${res.status()}\n${body}`);
  }
  return res.json();
};

export const registerStudent = async (request, email, password = 'test12345') => {
  return apiJson(request, '/auth/register', {
    method: 'POST',
    data: {
      email,
      password,
      full_name: 'Test Student',
      role: 'student',
      gdpr_consent: true,
    },
  });
};

export const registerTutor = async (request, email, slug, password = 'test12345') => {
  return apiJson(request, '/onboarding/tutor', {
    method: 'POST',
    data: {
      email,
      password,
      full_name: 'Test Tutor',
      tutor_slug: slug,
      display_name: 'Test Tutor',
      timezone: 'UTC',
      gdpr_consent: true,
    },
  });
};

// Drives the login form like a real user. Useful when the spec is
// specifically about login UX (the form-driven path stamps localStorage
// + sets the shared cookie; a direct /auth/token call only does the
// latter).
export const loginViaForm = async (page, email, password = 'test12345') => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
};
