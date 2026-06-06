import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [missingParams, setMissingParams] = useState(false);

  useEffect(() => {
    const e = params.get('email');
    const t = params.get('token');
    if (!e || !t) {
      setMissingParams(true);
      return;
    }
    setEmail(e);
    setToken(t);
  }, [params]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await client.post('/auth/reset-password', {
        email,
        token,
        new_password: password,
      });
      // Backend returns a fresh JWT — log the user in immediately.
      login(res.data.access_token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not reset password. The link may have expired — request a new one.');
    } finally {
      setSubmitting(false);
    }
  };

  if (missingParams) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-kotoba-primary mb-2">Link incomplete</h1>
          <p className="text-kotoba-text mb-4">
            The reset link is missing required information. Please request a new link.
          </p>
          <Link
            to="/forgot-password"
            className="inline-block px-5 py-2.5 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
          >
            Request new link
          </Link>
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
        <h1 className="text-2xl font-bold text-kotoba-primary">Set a new password</h1>
        <p className="text-sm text-kotoba-text/70">
          Resetting password for <strong>{email}</strong>.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <p className="mt-1 text-xs text-kotoba-text/60">At least 8 characters.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="confirm">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-5 py-2.5 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-60"
        >
          {submitting ? 'Setting…' : 'Set new password'}
        </button>
      </form>
    </div>
  );
};

export default ResetPassword;
