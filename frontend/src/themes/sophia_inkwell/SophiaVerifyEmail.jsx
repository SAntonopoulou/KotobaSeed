import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

const safeNext = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('//') || /^[a-z]+:/i.test(raw)) return null;
  return raw.startsWith('/') ? raw : null;
};

const SophiaVerifyEmail = ({ tutor }) => {
  const navigate = useNavigate();
  const { token, currentUser, setCurrentUser, logout } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

  if (!token) {
    navigate(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
    return null;
  }
  if (currentUser?.email_verified_at) {
    navigate(next || '/');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const res = await client.post('/auth/verify-email', { code: code.trim() });
      if (res.data?.verified) {
        try {
          const me = await client.get('/users/me');
          setCurrentUser(me.data);
        } catch { /* non-fatal */ }
        navigate(next || '/');
      } else {
        setError("That didn't match — try again.");
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    setResending(true);
    try {
      await client.post('/auth/resend-verification');
      setInfo("Code sent. Check your inbox — it may take a minute.");
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not resend.');
    } finally {
      setResending(false);
    }
  };

  return (
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Verify your email — English with ${firstName}`}
    >
      <main className="s-form-page">
        <h1 className="s-pt">Check your inbox</h1>
        <p className="s-pt-sub">
          We sent a 6-digit code to <strong>{currentUser?.email}</strong>. Enter it below to verify your account.
        </p>
        <div className="s-panel">
          <form onSubmit={handleSubmit}>
            <div className="s-field">
              <label className="s-field-label" htmlFor="sve-code">Verification code</label>
              <input
                id="sve-code"
                className="s-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoComplete="one-time-code"
                required
                autoFocus
                disabled={busy}
                style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 22 }}
              />
            </div>
            {error && <p className="s-form-error">{error}</p>}
            {info && <p className="s-form-success">{info}</p>}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="s-btn s-btn-primary s-btn-lg s-btn-block"
            >
              {busy ? 'Verifying…' : 'Verify and continue'}
            </button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--brand)',
                fontWeight: 600,
                fontSize: 13.5,
                padding: 0,
                font: 'inherit',
                textDecoration: 'underline',
              }}
            >
              {resending ? 'Sending…' : 'Resend the code'}
            </button>
          </div>
        </div>
      </main>
    </SophiaLayout>
  );
};

export default SophiaVerifyEmail;
