import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

// VassoLogin — themed `/login` for Vasso's tenant. Same backend
// integration as the default Login (POST /auth/token with form-encoded
// credentials). After successful auth, jumps to ?next= if provided
// (must be same-origin), otherwise home.

const safeNext = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('//') || /^[a-z]+:/i.test(raw)) return null;
  return raw.startsWith('/') ? raw : null;
};

const VassoLogin = ({ tutor }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { login, logout, currentUser } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Vasso';

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
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="Sign in — Learn Greek with Vasso"
    >
      <main className="content" style={{ maxWidth: 480, paddingTop: 48 }}>
        <h1 className="pt" style={{ textAlign: 'center' }}>
          Welcome back
        </h1>
        <p className="pt-sub" style={{ textAlign: 'center' }}>
          Sign in to pick up where you left off with {firstName}.
        </p>

        <div className="panel panel-pad" style={{ padding: 32 }}>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label" htmlFor="vlogin-email">Email</label>
              <input
                id="vlogin-email"
                className="v-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                disabled={busy}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="vlogin-pwd">Password</label>
              <input
                id="vlogin-pwd"
                className="v-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={busy}
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button
              type="submit"
              className="v-btn v-btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
              disabled={busy || !email || !password}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 20,
            fontSize: 13.5,
          }}>
            <Link
              to="/forgot-password"
              style={{ color: 'var(--brand)', fontWeight: 600 }}
            >
              Forgot password?
            </Link>
            <Link
              to="/register"
              style={{ color: 'var(--brand)', fontWeight: 600 }}
            >
              Create account
            </Link>
          </div>
        </div>
      </main>
    </VassoLayout>
  );
};

export default VassoLogin;
