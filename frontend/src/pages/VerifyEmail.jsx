import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const VerifyEmail = () => {
  const navigate = useNavigate();
  const { token, currentUser } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  // If the user landed here without a token, they probably refreshed or
  // navigated directly. Send them to /login.
  if (!token) {
    navigate('/login');
    return null;
  }

  // If they're already verified, send them home.
  if (currentUser?.email_verified_at) {
    navigate('/');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      const res = await client.post('/auth/verify-email', { code: code.trim() });
      if (res.data?.verified) {
        navigate('/');
      } else {
        setError("That didn't match — try again.");
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not verify the code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    setResending(true);
    try {
      await client.post('/auth/resend-verification');
      setInfo("Sent a fresh code to your email.");
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not resend.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="bg-kotoba-background min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-extrabold text-kotoba-primary">
          Check your email
        </h2>
        <p className="mt-3 text-center text-sm text-kotoba-text">
          We sent a 6-digit code to {currentUser?.email || 'your inbox'}.
          Enter it below to finish setting up your account.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow rounded-lg">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 bg-kotoba-primary/10 text-kotoba-primary px-4 py-3 rounded-md text-sm">
              {info}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-kotoba-text">
                Verification code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full px-3 py-3 text-center text-2xl font-mono tracking-widest border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
            >
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-sm text-kotoba-primary hover:underline disabled:opacity-60"
            >
              {resending ? 'Sending…' : "Didn't get one? Resend code"}
            </button>
          </div>

          <p className="mt-4 text-xs text-center text-kotoba-text/60">
            Codes expire 15 minutes after they're sent. Check your spam folder if it's missing.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
