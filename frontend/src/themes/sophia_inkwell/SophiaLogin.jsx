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

const SophiaLogin = ({ tutor }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { login, logout, currentUser } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

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
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Sign in — English with ${firstName}`}
    >
      <main className="s-form-page">
        <h1 className="s-pt">Welcome back</h1>
        <p className="s-pt-sub">
          Sign in to pick up where you left off with {firstName}.
        </p>

        <div className="s-panel">
          <form onSubmit={handleSubmit}>
            <div className="s-field">
              <label className="s-field-label" htmlFor="slogin-email">Email</label>
              <input
                id="slogin-email"
                className="s-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                disabled={busy}
              />
            </div>
            <div className="s-field">
              <label className="s-field-label" htmlFor="slogin-pwd">Password</label>
              <input
                id="slogin-pwd"
                className="s-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={busy}
              />
            </div>
            {error && <p className="s-form-error">{error}</p>}
            <button
              type="submit"
              className="s-btn s-btn-primary s-btn-lg s-btn-block"
              disabled={busy || !email || !password}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="s-form-row">
            <Link to="/forgot-password" className="s-form-link">
              Forgot password?
            </Link>
            <Link to="/register" className="s-form-link">
              Create account
            </Link>
          </div>
        </div>
      </main>
    </SophiaLayout>
  );
};

export default SophiaLogin;
