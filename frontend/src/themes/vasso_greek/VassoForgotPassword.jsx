import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

const VassoForgotPassword = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

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
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="Reset password — Learn Greek with Vasso"
    >
      <main className="content" style={{ maxWidth: 480, paddingTop: 48 }}>
        {submitted ? (
          <div className="panel panel-pad" style={{ textAlign: 'center', padding: 32 }}>
            <h1 className="pt" style={{ margin: '0 0 14px' }}>Check your email</h1>
            <p className="pt-sub" style={{ marginBottom: 14 }}>
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
          <div className="panel panel-pad" style={{ padding: 32 }}>
            <h1 className="pt" style={{ margin: '0 0 8px', textAlign: 'center' }}>
              Forgot your password?
            </h1>
            <p className="pt-sub" style={{ textAlign: 'center', marginBottom: 24 }}>
              Enter the email you signed up with and we'll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label" htmlFor="vfp-email">Email</label>
                <input
                  id="vfp-email"
                  className="v-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={submitting}
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="v-btn v-btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13.5, color: 'var(--fg-muted)' }}>
              Remembered it?{' '}
              <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 600 }}>
                Back to sign in
              </Link>
            </p>
          </div>
        )}
      </main>
    </VassoLayout>
  );
};

export default VassoForgotPassword;
