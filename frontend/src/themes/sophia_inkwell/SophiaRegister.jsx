import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

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

const SophiaRegister = ({ tutor }) => {
  const { currentUser, login, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  // Affiliate attribution: tenant subdomains receive `?ref=…` links from
  // referrers and need to forward the code so the server stamps the
  // attribution row. Truncate to the backend cap (32 chars).
  const refCode = (params.get('ref') || '').slice(0, 32) || null;
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

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
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Create account — English with ${firstName}`}
    >
      <main className="s-form-page">
        <h1 className="s-pt">Create your account</h1>
        <p className="s-pt-sub">
          So {firstName} can welcome you properly to your first lesson.
        </p>

        <div className="s-panel">
          <form onSubmit={handleSubmit}>
            <div className="s-field">
              <label className="s-field-label" htmlFor="sreg-name">Your name</label>
              <input
                id="sreg-name"
                className="s-input"
                type="text"
                value={form.full_name}
                onChange={(e) => update('full_name', e.target.value)}
                placeholder="Sara Mitchell"
                autoComplete="name"
                required
                disabled={busy}
              />
              {fieldErrors.full_name && (
                <p className="s-field-error">{fieldErrors.full_name}</p>
              )}
            </div>
            <div className="s-field">
              <label className="s-field-label" htmlFor="sreg-email">Email</label>
              <input
                id="sreg-email"
                className="s-input"
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={busy}
              />
              {fieldErrors.email && (
                <p className="s-field-error">{fieldErrors.email}</p>
              )}
            </div>
            <div className="s-field">
              <label className="s-field-label" htmlFor="sreg-pwd">Password</label>
              <input
                id="sreg-pwd"
                className="s-input"
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
                <p className="s-field-error">{fieldErrors.password}</p>
              )}
            </div>
            <label className="s-checkbox-row">
              <input
                type="checkbox"
                checked={form.gdpr_consent}
                onChange={(e) => update('gdpr_consent', e.target.checked)}
                disabled={busy}
              />
              <span>
                I agree to the{' '}
                <Link to="/terms" className="s-form-link">terms</Link>{' '}
                and{' '}
                <Link to="/privacy" className="s-form-link">privacy notice</Link>.
              </span>
            </label>
            <label className="s-checkbox-row">
              <input
                type="checkbox"
                checked={form.newsletter_opt_in}
                onChange={(e) => update('newsletter_opt_in', e.target.checked)}
                disabled={busy}
              />
              <span>
                Optional: send me occasional notes from {firstName} (lesson tips, new content). Unsubscribe any time.
              </span>
            </label>
            {banner && <p className="s-form-error">{banner}</p>}
            <button
              type="submit"
              className="s-btn s-btn-primary s-btn-lg s-btn-block"
              disabled={busy || !form.full_name || !form.email || !form.password}
            >
              {busy ? 'Creating your account…' : 'Create account'}
            </button>
          </form>
          <p style={{ marginTop: 18, textAlign: 'center', fontSize: 13.5, color: 'var(--fg-muted)' }}>
            Already have one?{' '}
            <Link to="/login" className="s-form-link">Sign in</Link>
          </p>
        </div>
      </main>
    </SophiaLayout>
  );
};

export default SophiaRegister;
