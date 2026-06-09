import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import DafniLayout from './DafniLayout';
import './dafni_botanical.css';

const safeNext = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('//') || /^[a-z]+:/i.test(raw)) return null;
  return raw.startsWith('/') ? raw : null;
};

const DafniLogin = ({ tutor }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { login, logout, currentUser } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Dafni';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      const response = await client.post('/auth/token', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      login(response.data.access_token);
      navigate(next || '/');
    } catch (_err) {
      setError('Invalid email or password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DafniLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Sign in — Learn Greek with ${firstName}`}
    >
      <main className="d-form-page">
        <h1 className="d-pt">Welcome back</h1>
        <p className="d-pt-sub">
          Sign in to pick up where you left off with {firstName}.
        </p>

        <div className="d-panel">
          <form onSubmit={handleSubmit}>
            <div className="d-field">
              <label className="d-field-label" htmlFor="dlogin-email">Email</label>
              <input
                id="dlogin-email"
                className="d-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                disabled={busy}
              />
            </div>
            <div className="d-field">
              <label className="d-field-label" htmlFor="dlogin-pwd">Password</label>
              <input
                id="dlogin-pwd"
                className="d-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={busy}
              />
            </div>
            {error && <p className="d-form-error">{error}</p>}
            <button
              type="submit"
              className="d-btn d-btn-primary d-btn-lg d-btn-block"
              disabled={busy || !email || !password}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="d-form-row">
            <Link to="/forgot-password" className="d-form-link">
              Forgot password?
            </Link>
            <Link to="/register" className="d-form-link">
              Create account
            </Link>
          </div>
        </div>
      </main>
    </DafniLayout>
  );
};

export default DafniLogin;
