import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // We always show the same success state regardless of whether the email
  // matched a user — protects against email enumeration.
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
      // Endpoint always returns ok=true — anything reaching here is a
      // network/server problem.
      setError(err?.response?.data?.detail || 'Could not request a reset right now. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-kotoba-primary mb-2">Check your email</h1>
          <p className="text-kotoba-text">
            If <strong>{email}</strong> matches a Kotobaseed account, we've sent a password reset link. It expires in 60 minutes.
          </p>
          <p className="text-sm text-kotoba-text/60 mt-4">
            Didn't get it? Check spam, or{' '}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="text-kotoba-primary underline"
            >
              try a different email
            </button>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full space-y-4"
      >
        <h1 className="text-2xl font-bold text-kotoba-primary">Forgot your password?</h1>
        <p className="text-sm text-kotoba-text/70">
          Enter the email you signed up with and we'll send you a link to set a new password.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-5 py-2.5 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="text-sm text-center text-kotoba-text/70">
          Remembered it? <Link to="/login" className="text-kotoba-primary underline">Back to login</Link>
        </p>
      </form>
    </div>
  );
};

export default ForgotPassword;
