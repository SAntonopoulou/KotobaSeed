import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

const VassoResetPassword = ({ tutor }) => {
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
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="Set a new password — Learn Greek with Vasso"
    >
      <main className="content" style={{ maxWidth: 480, paddingTop: 48 }}>
        {missingParams ? (
          <div className="panel panel-pad" style={{ textAlign: 'center', padding: 32 }}>
            <h1 className="pt" style={{ margin: '0 0 14px' }}>Link incomplete</h1>
            <p className="pt-sub" style={{ marginBottom: 24 }}>
              The reset link is missing required information. Request a new link to try again.
            </p>
            <Link to="/forgot-password" className="v-btn v-btn-primary">
              Request new link
            </Link>
          </div>
        ) : (
          <div className="panel panel-pad" style={{ padding: 32 }}>
            <h1 className="pt" style={{ margin: '0 0 8px', textAlign: 'center' }}>
              Set a new password
            </h1>
            <p className="pt-sub" style={{ textAlign: 'center', marginBottom: 24 }}>
              Resetting for <strong>{email}</strong>.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label" htmlFor="vrp-pwd">New password</label>
                <input
                  id="vrp-pwd"
                  className="v-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={busy}
                />
                <p style={{ fontSize: 12, color: 'var(--fg-subtle)', margin: '6px 0 0' }}>
                  At least 8 characters.
                </p>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="vrp-conf">Confirm password</label>
                <input
                  id="vrp-conf"
                  className="v-input"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={busy}
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="v-btn v-btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {busy ? 'Setting…' : 'Set new password'}
              </button>
            </form>
          </div>
        )}
      </main>
    </VassoLayout>
  );
};

export default VassoResetPassword;
