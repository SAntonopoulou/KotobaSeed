import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  STRIPE_CONNECT_COUNTRIES,
  guessCountryFromBrowser,
  guessTimezone,
} from '../utils/countries';

const initialForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'student',
  gdpr_consent: false,
  newsletter_opt_in: false,
  // Tutor-only fields, ignored unless role === 'tutor'
  tutor_slug: '',
  display_name: '',
  languages_taught: '',
  timezone: 'UTC',
  country: '',
};

const slugify = (raw) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// Only allow same-origin redirects via ?next=… — prevents a phishing
// attacker from crafting a /register?next=//evil.example/ link.
const safeNext = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('//') || /^[a-z]+:/i.test(raw)) return null;
  return raw.startsWith('/') ? raw : null;
};

const ROLE_LABELS = {
  student: 'Student — I want to learn',
  creator: 'Creator — I make comprehensible-input content for the marketplace',
  tutor: 'Tutor — I want my own teaching site for one-to-one lessons',
};

// Parse a FastAPI/Pydantic 422 error response into a field → message map
// so each input can render its own inline error. The shape is:
//   { detail: [ { loc: ["body", "email"], msg: "..." }, ... ] }
// Some endpoints return a flat string `detail` — that becomes the page-
// level banner instead.
const parseFieldErrors = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return { banner: 'Registration failed', fields: {} };
  if (typeof detail === 'string') return { banner: detail, fields: {} };
  if (!Array.isArray(detail)) return { banner: 'Registration failed', fields: {} };
  const fields = {};
  for (const entry of detail) {
    const loc = entry?.loc;
    if (Array.isArray(loc) && loc.length >= 2) {
      const name = String(loc[loc.length - 1]);
      // Strip the "Value error, " prefix Pydantic adds for custom validators.
      const raw = entry?.msg || 'Invalid value';
      fields[name] = raw.replace(/^Value error,\s*/i, '');
    }
  }
  const banner = Object.keys(fields).length === 0
    ? 'Registration failed'
    : 'Please fix the highlighted fields below.';
  return { banner, fields };
};

const FieldError = ({ message }) => {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-red-600" role="alert">
      {message}
    </p>
  );
};

const fieldClass = (hasError, extra = '') =>
  `mt-1.5 w-full px-4 py-2.5 border rounded-2xl placeholder-kotoba-text/40 focus:outline-none focus:ring-4 text-sm transition-all ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
      : 'border-kotoba-text/15 focus:border-kotoba-primary focus:ring-kotoba-primary/10'
  } ${extra}`;

const Register = () => {
  const [form, setForm] = useState(() => ({
    ...initialForm,
    timezone: guessTimezone(),
    country: guessCountryFromBrowser() || '',
  }));
  const [banner, setBanner] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [stripeRedirecting, setStripeRedirecting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const [params] = useSearchParams();
  // Referral code from `?ref=XYZ` — sent on signup so the platform can
  // stamp an attribution. Uppercased to match how codes are stored.
  const refCode = (params.get('ref') || '').toUpperCase().trim() || null;
  const next = safeNext(params.get('next'));

  const slug = useMemo(() => slugify(form.tutor_slug), [form.tutor_slug]);
  const slugPreview = slug ? `${slug}.kotobaseed.net` : 'yourname.kotobaseed.net';

  // Re-detect the user's country if it changes (rare, but the picker
  // shouldn't lock to whatever was guessed on first paint).
  useEffect(() => {
    if (!form.country) {
      const guess = guessCountryFromBrowser();
      if (guess) setForm((f) => ({ ...f, country: guess }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
    // Clear the field's error the moment the user starts editing it —
    // they're already telling us "I'm fixing this".
    if (fieldErrors[name]) {
      setFieldErrors((errs) => {
        const next = { ...errs };
        delete next[name];
        return next;
      });
    }
  };

  // Client-side validation pass that mirrors the server-side rules so
  // we can highlight problems before the network round trip.
  const clientValidate = () => {
    const errs = {};
    if (!form.full_name.trim()) errs.full_name = 'Required.';
    if (!form.email.trim()) errs.email = 'Required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "That doesn't look like an email address.";
    if (!form.password) errs.password = 'Required.';
    else if (form.password.length < 8) errs.password = 'At least 8 characters.';
    if (!form.gdpr_consent) errs.gdpr_consent = 'Please confirm consent to continue.';
    if (form.role === 'tutor') {
      if (slug.length < 3) errs.tutor_slug = 'At least 3 characters, letters, numbers, or hyphens.';
      if (!form.display_name.trim()) errs.display_name = 'Required.';
      if (!form.country) errs.country = 'Pick the country your bank account is in.';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBanner('');
    const clientErrs = clientValidate();
    if (Object.keys(clientErrs).length) {
      setFieldErrors(clientErrs);
      setBanner('Please fix the highlighted fields below.');
      return;
    }

    setSubmitting(true);
    try {
      if (form.role === 'tutor') {
        const payload = {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          tutor_slug: slug,
          display_name: form.display_name.trim(),
          languages_taught: form.languages_taught || null,
          timezone: form.timezone || 'UTC',
          country: form.country,
          gdpr_consent: true,
          newsletter_opt_in: form.newsletter_opt_in,
          ref_code: refCode,
        };
        const res = await client.post('/onboarding/tutor', payload);
        const { access_token, onboarding_url } = res.data || {};
        if (access_token) login(access_token);
        // Email verify first, then KYC. The verify-email page picks up
        // a follow-up `kyc_url` query so we can keep the handoff
        // single-flight when the user does verify right away.
        if (onboarding_url) {
          // Stamp the URL on the auth token's user record AFTER verify
          // — but for users who'd rather defer KYC, the dashboard surfaces
          // a banner. Route through verify-email first.
          try { sessionStorage.setItem('koto_pending_kyc_url', onboarding_url); } catch {}
        }
        navigate(next ? `/verify-email?next=${encodeURIComponent(next)}` : '/verify-email');
        return;
      }

      // Student or Creator: regular /auth/register
      const res = await client.post('/auth/register', {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: form.role,
        gdpr_consent: true,
        newsletter_opt_in: form.newsletter_opt_in,
        ref_code: refCode,
      });
      const token = res?.data?.access_token;
      if (token) login(token);
      // Preserve the ?next=… handoff (e.g. mid-booking signup) so the
      // verify-email page can route them back to where they were going.
      navigate(next ? `/verify-email?next=${encodeURIComponent(next)}` : '/verify-email');
    } catch (err) {
      const { banner: bannerMsg, fields } = parseFieldErrors(err);
      setBanner(bannerMsg);
      setFieldErrors(fields);
      setSubmitting(false);
    }
  };

  if (stripeRedirecting) {
    return (
      <div className="font-sans min-h-screen bg-kotoba-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-kotoba-primary border-t-transparent rounded-full animate-spin mb-6" aria-hidden="true" />
        <h2 className="font-display text-2xl font-bold text-kotoba-primary tracking-[-0.015em]">
          Handing you over to Stripe…
        </h2>
        <p className="mt-3 text-sm text-kotoba-text/75 max-w-md leading-relaxed">
          Your account is created. We're opening Stripe so you can verify your identity and connect a bank account.
        </p>
      </div>
    );
  }

  return (
    <div className="font-sans min-h-screen bg-kotoba-background flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative isolate">
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
        <div
          className="v2-mesh-blob"
          style={{
            top: '-15%',
            left: '-10%',
            width: '50%',
            height: '60%',
            background:
              'radial-gradient(circle, rgba(214,164,47,0.20), transparent 70%)',
          }}
        />
        <div
          className="v2-mesh-blob v2-mesh-blob-2"
          style={{
            bottom: '-15%',
            right: '-10%',
            width: '50%',
            height: '60%',
            background:
              'radial-gradient(circle, rgba(22,86,29,0.08), transparent 70%)',
          }}
        />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
          Start here
        </p>
        <h2 className="mt-2 font-display text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.02em]">
          Create an account
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white rounded-3xl shadow-soft p-7 sm:p-9">
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {banner && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm" role="alert">
                {banner}
              </div>
            )}
            {refCode && (
              <div className="bg-kotoba-primary/10 border border-kotoba-primary/20 text-kotoba-primary px-4 py-3 rounded-2xl text-sm">
                You're signing up via referral code <strong>{refCode}</strong>. Once you complete your first paid lesson, your friend earns a reward.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-kotoba-text/80">I am a…</label>
              <div className="mt-2 space-y-2">
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer text-sm transition-all ${
                      form.role === value
                        ? 'border-kotoba-primary bg-kotoba-primary/5 shadow-soft'
                        : 'border-kotoba-text/[0.08] hover:border-kotoba-primary/30 hover:bg-kotoba-background/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={form.role === value}
                      onChange={handleChange}
                      className="mt-0.5 h-4 w-4 text-kotoba-primary border-kotoba-text/20 focus:ring-kotoba-primary"
                    />
                    <span className="text-kotoba-text/85">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-kotoba-text/80">
                Full Name
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                value={form.full_name}
                onChange={handleChange}
                aria-invalid={Boolean(fieldErrors.full_name)}
                className={fieldClass(fieldErrors.full_name)}
              />
              <FieldError message={fieldErrors.full_name} />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-kotoba-text/80">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={handleChange}
                aria-invalid={Boolean(fieldErrors.email)}
                className={fieldClass(fieldErrors.email)}
              />
              <FieldError message={fieldErrors.email} />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-kotoba-text/80">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={form.password}
                onChange={handleChange}
                aria-invalid={Boolean(fieldErrors.password)}
                className={fieldClass(fieldErrors.password)}
              />
              <FieldError message={fieldErrors.password} />
            </div>

            {form.role === 'tutor' && (
              <div className="border-t pt-4 space-y-4">
                <p className="text-sm font-medium text-kotoba-text/80">Your tutor site</p>

                <div>
                  <label htmlFor="display_name" className="block text-xs font-medium text-kotoba-text/60 mb-1">
                    Display name (shown on your site)
                  </label>
                  <input
                    id="display_name"
                    name="display_name"
                    type="text"
                    required
                    value={form.display_name}
                    onChange={handleChange}
                    aria-invalid={Boolean(fieldErrors.display_name)}
                    placeholder="Vasso"
                    className={fieldClass(fieldErrors.display_name)}
                  />
                  <FieldError message={fieldErrors.display_name} />
                </div>

                <div>
                  <label htmlFor="tutor_slug" className="block text-xs font-medium text-kotoba-text/60 mb-1">
                    Slug
                  </label>
                  <div className={`flex rounded-2xl overflow-hidden border focus-within:ring-4 transition-all ${
                    fieldErrors.tutor_slug ? 'border-red-400 focus-within:ring-red-200' : 'border-kotoba-text/15 focus-within:border-kotoba-primary focus-within:ring-kotoba-primary/10'
                  }`}>
                    <input
                      id="tutor_slug"
                      name="tutor_slug"
                      type="text"
                      required
                      value={form.tutor_slug}
                      onChange={handleChange}
                      aria-invalid={Boolean(fieldErrors.tutor_slug)}
                      placeholder="vasso"
                      autoCapitalize="none"
                      className="flex-1 px-3 py-2 focus:outline-none text-sm"
                    />
                    <span className="bg-kotoba-background/40 text-kotoba-text/60 px-3 py-2 text-sm self-stretch flex items-center">
                      .kotobaseed.net
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-kotoba-text/60">
                    Site URL: <span className="font-medium text-kotoba-primary">{slugPreview}</span>
                  </p>
                  <FieldError message={fieldErrors.tutor_slug} />
                </div>

                <div>
                  <label htmlFor="country" className="block text-xs font-medium text-kotoba-text/60 mb-1">
                    Country (where your bank account is)
                  </label>
                  <select
                    id="country"
                    name="country"
                    required
                    value={form.country}
                    onChange={handleChange}
                    aria-invalid={Boolean(fieldErrors.country)}
                    className={fieldClass(fieldErrors.country)}
                  >
                    <option value="">Select your country…</option>
                    {STRIPE_CONNECT_COUNTRIES.map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-kotoba-text/60">
                    Stripe will open a Connect account in this country. You can't change it later, so pick the country where you legally operate and where your bank account lives.
                  </p>
                  <FieldError message={fieldErrors.country} />
                </div>

                <div>
                  <label htmlFor="languages_taught" className="block text-xs font-medium text-kotoba-text/60 mb-1">
                    Languages you teach (optional)
                  </label>
                  <input
                    id="languages_taught"
                    name="languages_taught"
                    type="text"
                    value={form.languages_taught}
                    onChange={handleChange}
                    placeholder="Greek, English"
                    className={fieldClass(fieldErrors.languages_taught)}
                  />
                </div>

                {/* Prominent KYC callout — Sophia's partner missed the soft
                    footnote and was surprised by the Stripe identity check. */}
                <div className="bg-amber-50 border-l-4 border-amber-400 text-amber-900 px-4 py-3 rounded-2xl text-sm space-y-2">
                  <p className="font-display font-bold">Next step: Stripe identity check (KYC)</p>
                  <p>
                    After you submit this form we hand you over to Stripe so you can verify your identity and connect a payout account. Have ready:
                  </p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li>A government-issued photo ID (passport or driving licence)</li>
                    <li>Your business or personal details (registered name, address)</li>
                    <li>A bank account in the country you picked above</li>
                  </ul>
                  <p className="text-xs">
                    Nothing is published on your tutor site and you can't receive payments until Stripe verifies you. You can come back and finish this later from your dashboard.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="flex items-start gap-3 text-sm text-kotoba-text/80">
                <input
                  type="checkbox"
                  name="gdpr_consent"
                  checked={form.gdpr_consent}
                  onChange={handleChange}
                  aria-invalid={Boolean(fieldErrors.gdpr_consent)}
                  className={`mt-1 h-4 w-4 text-kotoba-primary rounded focus:ring-kotoba-primary ${
                    fieldErrors.gdpr_consent ? 'border-red-400' : 'border-kotoba-text/20'
                  }`}
                />
                <span>
                  I agree to Kotobaseed processing my data to provide the platform, per the Privacy Policy. I can delete my account any time.
                </span>
              </label>
              <FieldError message={fieldErrors.gdpr_consent} />
            </div>

            <div>
              <label className="flex items-start gap-3 text-sm text-kotoba-text/80">
                <input
                  type="checkbox"
                  name="newsletter_opt_in"
                  checked={form.newsletter_opt_in}
                  onChange={handleChange}
                  className="mt-1 h-4 w-4 text-kotoba-primary rounded focus:ring-kotoba-primary border-kotoba-text/20"
                />
                <span>
                  Optional: send me occasional product updates and tips. You can unsubscribe any time from any email.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="group w-full flex justify-center items-center gap-2 px-5 py-3 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {submitting && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              )}
              {submitting
                ? (form.role === 'tutor' ? 'Setting up your account…' : 'Creating account…')
                : (form.role === 'tutor' ? 'Continue to email verification' : 'Register')}
              {!submitting && (
                <span
                  className="transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  →
                </span>
              )}
            </button>

            <p className="text-sm text-center text-kotoba-text/70">
              Already have an account?{' '}
              <Link
                to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
                className="text-kotoba-primary font-semibold hover:underline"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register;
