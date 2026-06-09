import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../hooks/useTenant';

// Demo mode — only the staging build has VITE_DEMO_MODE=true. When on,
// we surface a "try with these accounts" card above the login form so
// visitors can click through and see the platform in action without
// having to sign up. The credentials match the demo seed script.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_ACCOUNTS = [
  {
    label: 'Try as a tutor',
    sub: "Vasso — Greek tutor, Pro plan",
    email: 'vasso@kotobaseed-demo.example',
    password: 'demo-password',
  },
  {
    label: 'Try as a student',
    sub: 'Alex — student with bookings, modules, conversations',
    email: 'alex@kotobaseed-demo.example',
    password: 'demo-password',
  },
];

// Only allow same-origin redirects via ?next=… — prevents a phishing
// attacker from crafting a /login?next=//evil.example/ link.
const safeNext = (raw) => {
  if (!raw) return null;
  // Must start with a single `/` (not `//` and not a URL).
  if (raw.startsWith('//') || /^[a-z]+:/i.test(raw)) return null;
  return raw.startsWith('/') ? raw : null;
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();
  const tenant = useTenant();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const submitWith = async (overrideEmail, overridePassword) => {
    setError('');
    const u = overrideEmail ?? email;
    const p = overridePassword ?? password;
    try {
      const formData = new URLSearchParams();
      formData.append('username', u);
      formData.append('password', p);
      const response = await client.post('/auth/token', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      login(response.data.access_token);
      if (next) navigate(next);
      else navigate(tenant.kind === 'tutor' ? '/dashboard' : '/');
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  const handleDemoClick = (acct) => {
    setEmail(acct.email);
    setPassword(acct.password);
    submitWith(acct.email, acct.password);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // The OAuth2PasswordRequestForm expects form data, not JSON
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await client.post('/auth/token', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      login(response.data.access_token);
      // ?next=… wins (e.g. user was bounced here from a booking dialog).
      // Otherwise: on a tutor subdomain → /dashboard, else → /.
      if (next) {
        navigate(next);
      } else {
        navigate(tenant.kind === 'tutor' ? '/dashboard' : '/');
      }
    } catch (err) {
      console.error(err);
      setError('Invalid email or password');
    }
  };

  return (
    <div className="font-sans min-h-screen bg-kotoba-background flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative isolate">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 overflow-hidden"
      >
        <div
          className="v2-mesh-blob"
          style={{
            top: '-15%',
            left: '-10%',
            width: '50%',
            height: '60%',
            background:
              'radial-gradient(circle, rgba(214,164,47,0.22), transparent 70%)',
          }}
        />
        <div
          className="v2-mesh-blob v2-mesh-blob-2"
          style={{
            bottom: '-15%',
            right: '-10%',
            width: '50%',
            height: '60%',
            background:
              'radial-gradient(circle, rgba(22,86,29,0.10), transparent 70%)',
          }}
        />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
          Welcome back
        </p>
        <h2 className="mt-2 font-display text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.02em]">
          Sign in
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {DEMO_MODE && (
          <div className="mb-4 bg-white rounded-3xl shadow-soft p-6 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                Demo environment
              </p>
              <p className="text-sm text-kotoba-text/75 mt-2 leading-relaxed">
                Browse the platform with one of these test accounts. The classroom is disabled here.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => handleDemoClick(a)}
                  className="group text-left p-3.5 rounded-2xl border border-kotoba-text/[0.08] hover:border-kotoba-primary/40 hover:bg-kotoba-primary/[0.03] hover:-translate-y-0.5 transition-all duration-300 ease-soft"
                >
                  <p className="font-display text-sm font-bold text-kotoba-primary">{a.label}</p>
                  <p className="text-xs text-kotoba-text/65 mt-0.5">{a.sub}</p>
                  <p className="text-[10px] text-kotoba-text/40 mt-1.5 font-mono truncate">{a.email}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-kotoba-text/50">
              Or sign up for a free test account using the form below.
            </p>
          </div>
        )}
        <div className="bg-white rounded-3xl shadow-soft p-7 sm:p-9">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm" role="alert">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-kotoba-text/80">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full px-4 py-2.5 border border-kotoba-text/15 rounded-2xl placeholder-kotoba-text/40 focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all text-sm"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-kotoba-text/80">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full px-4 py-2.5 border border-kotoba-text/15 rounded-2xl placeholder-kotoba-text/40 focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all text-sm"
              />
            </div>

            <div className="flex items-center justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-kotoba-primary hover:underline"
              >
                Forgot your password?
              </Link>
            </div>

            <button
              type="submit"
              className="group w-full flex justify-center items-center px-5 py-3 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft"
            >
              Sign in
              <span
                className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              >
                →
              </span>
            </button>

            <p className="text-sm text-center text-kotoba-text/70">
              New here?{' '}
              <Link
                to={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
                className="text-kotoba-primary font-semibold hover:underline"
              >
                Create an account
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
