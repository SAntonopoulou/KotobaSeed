import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

const SophiaResetPassword = ({ tutor }) => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login, currentUser, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [missingParams, setMissingParams] = useState(false);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

  useEffect(() => {
    const e = params.get('email');
    const t = params.get('token');
    if (!e || !t) { setMissingParams(true); return; }
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
    setBusy(true);
    try {
      const res = await client.post('/auth/reset-password', {
        email,
        token,
        new_password: password,
      });
      login(res.data.access_token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          'Could not reset password. The link may have expired — request a new one.',
      );
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
      setTitle={`Set a new password — English with ${firstName}`}
    >
      <main className="s-form-page">
        {missingParams ? (
          <div className="s-panel" style={{ textAlign: 'center' }}>
            <h1 className="s-pt" style={{ marginBottom: 14 }}>Link incomplete</h1>
            <p className="s-pt-sub" style={{ marginBottom: 24 }}>
              The reset link is missing required information. Request a new link to try again.
            </p>
            <Link to="/forgot-password" className="s-btn s-btn-primary s-btn-lg">
              Request new link
            </Link>
          </div>
        ) : (
          <div className="s-panel">
            <h1 className="s-pt">Set a new password</h1>
            <p className="s-pt-sub">
              Resetting for <strong>{email}</strong>.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="s-field">
                <label className="s-field-label" htmlFor="srp-pwd">New password</label>
                <input
                  id="srp-pwd"
                  className="s-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={busy}
                />
                <p className="s-field-hint">At least 8 characters.</p>
              </div>
              <div className="s-field">
                <label className="s-field-label" htmlFor="srp-conf">Confirm password</label>
                <input
                  id="srp-conf"
                  className="s-input"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={busy}
                />
              </div>
              {error && <p className="s-form-error">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="s-btn s-btn-primary s-btn-lg s-btn-block"
              >
                {busy ? 'Setting…' : 'Set new password'}
              </button>
            </form>
          </div>
        )}
      </main>
    </SophiaLayout>
  );
};

export default SophiaResetPassword;
