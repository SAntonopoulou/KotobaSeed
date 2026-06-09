import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import DafniLayout from './DafniLayout';
import './dafni_botanical.css';

const DafniForgotPassword = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Dafni';

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
    <DafniLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Reset password — Learn Greek with ${firstName}`}
    >
      <main className="d-form-page">
        {submitted ? (
          <div className="d-panel" style={{ textAlign: 'center' }}>
            <h1 className="d-pt" style={{ marginBottom: 14 }}>Check your email</h1>
            <p className="d-pt-sub" style={{ marginBottom: 14 }}>
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
          <div className="d-panel">
            <h1 className="d-pt">Forgot your password?</h1>
            <p className="d-pt-sub">
              Enter the email you signed up with and we'll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="d-field">
                <label className="d-field-label" htmlFor="dfp-email">Email</label>
                <input
                  id="dfp-email"
                  className="d-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={submitting}
                />
              </div>
              {error && <p className="d-form-error">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="d-btn d-btn-primary d-btn-lg d-btn-block"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13.5, color: 'var(--fg-muted)' }}>
              Remembered it?{' '}
              <Link to="/login" className="d-form-link">Back to sign in</Link>
            </p>
          </div>
        )}
      </main>
    </DafniLayout>
  );
};

export default DafniForgotPassword;
