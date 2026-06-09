import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

const SophiaForgotPassword = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter the email on your account.');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/auth/forgot-password', { email: email.trim() });
      setSubmitted(true);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          'Could not request a reset right now. Try again in a moment.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Reset password — English with ${firstName}`}
    >
      <main className="s-form-page">
        {submitted ? (
          <div className="s-panel" style={{ textAlign: 'center' }}>
            <h1 className="s-pt" style={{ marginBottom: 14 }}>Check your email</h1>
            <p className="s-pt-sub" style={{ marginBottom: 14 }}>
              If <strong>{email}</strong> matches an account, we've sent a password reset link. It expires in 60 minutes.
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--fg-subtle)' }}>
              Didn't get it? Check spam, or{' '}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--brand)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                try a different email
              </button>.
            </p>
          </div>
        ) : (
          <div className="s-panel">
            <h1 className="s-pt">Forgot your password?</h1>
            <p className="s-pt-sub">
              Enter the email you signed up with and we'll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="s-field">
                <label className="s-field-label" htmlFor="sfp-email">Email</label>
                <input
                  id="sfp-email"
                  className="s-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={submitting}
                />
              </div>
              {error && <p className="s-form-error">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="s-btn s-btn-primary s-btn-lg s-btn-block"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13.5, color: 'var(--fg-muted)' }}>
              Remembered it?{' '}
              <Link to="/login" className="s-form-link">Back to sign in</Link>
            </p>
          </div>
        )}
      </main>
    </SophiaLayout>
  );
};

export default SophiaForgotPassword;
