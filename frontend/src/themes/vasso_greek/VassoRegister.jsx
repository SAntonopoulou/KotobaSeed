import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

// VassoRegister — student-only sign-up on Vasso's tenant. Tutors who
// want their own platform site go through the apex /register (with the
// full role picker + tutor-onboarding wizard). Here the form is
// deliberately minimal: name + email + password + GDPR consent.

const safeNext = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('//') || /^[a-z]+:/i.test(raw)) return null;
  return raw.startsWith('/') ? raw : null;
};

const parseFieldErrors = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return { banner: 'Could not create your account.', fields: {} };
  if (typeof detail === 'string') return { banner: detail, fields: {} };
  if (!Array.isArray(detail)) return { banner: 'Could not create your account.', fields: {} };
  const fields = {};
  for (const entry of detail) {
    const loc = entry?.loc;
    if (Array.isArray(loc) && loc.length >= 2) {
      const name = String(loc[loc.length - 1]);
      const raw = entry?.msg || 'Invalid value';
      fields[name] = raw.replace(/^Value error,\s*/i, '');
    }
  }
  const banner = Object.keys(fields).length === 0
    ? 'Could not create your account.'
    : 'Please fix the highlighted fields below.';
  return { banner, fields };
};

const VassoRegister = ({ tutor }) => {
  const { currentUser, login, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  // Affiliate attribution: forward `?ref=…` to the backend so the
  // server stamps the attribution row. Truncate to the backend cap.
  const refCode = (params.get('ref') || '').slice(0, 32) || null;
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Vasso';

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    gdpr_consent: false,
    newsletter_opt_in: false,
  });
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const { [key]: _drop, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBanner('');
    setFieldErrors({});
    if (!form.gdpr_consent) {
      setBanner('Please tick the consent box to continue.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: 'student',
        gdpr_consent: form.gdpr_consent,
        newsletter_opt_in: form.newsletter_opt_in,
        ...(refCode ? { ref_code: refCode } : {}),
      };
      await client.post('/auth/register', payload);

      // Most installs require email verification; if the auto-login
      // call below works, great — if it 401s, treat as "verify your email
      // first".
      try {
        const formData = new URLSearchParams();
        formData.append('username', payload.email);
        formData.append('password', payload.password);
        const tokenRes = await client.post('/auth/token', formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        login(tokenRes.data.access_token);
        navigate(next || '/');
      } catch {
        navigate('/verify-email');
      }
    } catch (err) {
      const parsed = parseFieldErrors(err);
      setBanner(parsed.banner);
      setFieldErrors(parsed.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="Create account — Learn Greek with Vasso"
    >
      <main className="content" style={{ maxWidth: 480, paddingTop: 48 }}>
        <h1 className="pt" style={{ textAlign: 'center' }}>Create your account</h1>
        <p className="pt-sub" style={{ textAlign: 'center' }}>
          So {firstName} can welcome you properly to your first lesson.
        </p>

        <div className="panel panel-pad" style={{ padding: 32 }}>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label" htmlFor="vreg-name">Your name</label>
              <input
                id="vreg-name"
                className="v-input"
                type="text"
                value={form.full_name}
                onChange={(e) => update('full_name', e.target.value)}
                placeholder="Sara Mitchell"
                autoComplete="name"
                required
                disabled={busy}
              />
              {fieldErrors.full_name && (
                <p style={{ fontSize: 12, color: 'var(--terra-700)', margin: '6px 0 0' }}>
                  {fieldErrors.full_name}
                </p>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="vreg-email">Email</label>
              <input
                id="vreg-email"
                className="v-input"
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={busy}
              />
              {fieldErrors.email && (
                <p style={{ fontSize: 12, color: 'var(--terra-700)', margin: '6px 0 0' }}>
                  {fieldErrors.email}
                </p>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="vreg-pwd">Password</label>
              <input
                id="vreg-pwd"
                className="v-input"
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={busy}
              />
              {fieldErrors.password && (
                <p style={{ fontSize: 12, color: 'var(--terra-700)', margin: '6px 0 0' }}>
                  {fieldErrors.password}
                </p>
              )}
            </div>
            <label style={{
              display: 'inline-flex',
              alignItems: 'flex-start',
              gap: 9,
              marginTop: 6,
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={form.gdpr_consent}
                onChange={(e) => update('gdpr_consent', e.target.checked)}
                style={{ marginTop: 3 }}
                disabled={busy}
              />
              <span style={{ fontSize: 13.5, color: 'var(--fg)', lineHeight: 1.5 }}>
                I agree to the{' '}
                <Link to="/terms" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>
                  terms
                </Link>{' '}
                and{' '}
                <Link to="/privacy" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>
                  privacy notice
                </Link>.
              </span>
            </label>
            <label style={{
              display: 'inline-flex',
              alignItems: 'flex-start',
              gap: 9,
              marginTop: 8,
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={form.newsletter_opt_in}
                onChange={(e) => update('newsletter_opt_in', e.target.checked)}
                style={{ marginTop: 3 }}
                disabled={busy}
              />
              <span style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                Optional: send me occasional notes from {firstName} (lesson tips, new content). Unsubscribe any time.
              </span>
            </label>
            {banner && <p className="form-error" style={{ marginTop: 14 }}>{banner}</p>}
            <button
              type="submit"
              className="v-btn v-btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
              disabled={busy || !form.full_name || !form.email || !form.password}
            >
              {busy ? 'Creating your account…' : 'Create account'}
            </button>
          </form>
          <p style={{ marginTop: 18, textAlign: 'center', fontSize: 13.5, color: 'var(--fg-muted)' }}>
            Already have one?{' '}
            <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </VassoLayout>
  );
};

export default VassoRegister;
