import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import client from '../api/client';
import Soba from '../components/demo/Soba';
import { useAuth } from '../context/AuthContext';
import { useDemo } from '../context/DemoContext';
import { useReveal } from '../hooks/landingAnimations';
import { getErrorMessage } from '../utils/errors';

// /try/{role} — single-email passwordless entry. Submitting creates a
// real persistent demo account, sets the session cookie, and drops the
// user into the app for their role. The page IS the way in; if a
// signed-in session already exists we bounce them in on mount.

const ROLE_COPY = {
  tutor: {
    label: 'Tutor',
    eyebrow: 'For independent tutors',
    headline: 'Try teaching here.',
    accent: 'Built around how you actually work.',
    blurb: 'Pre-filled with a sample tutor site, a couple of articles, a module, and a lesson pack. Edit anything. Nothing goes live until you convert.',
    submitLabel: 'Take me into the demo',
  },
  creator: {
    label: 'Creator',
    eyebrow: 'For marketplace creators',
    headline: 'Try making projects here.',
    accent: 'See what the marketplace looks like as a creator.',
    blurb: 'Pre-filled with a funded project, a completed one, and a few backers. Edit anything. No real money moves.',
    submitLabel: 'Take me into the demo',
  },
  student: {
    label: 'Student',
    eyebrow: 'For students',
    headline: 'Try learning here.',
    accent: 'Browse like a real student would.',
    blurb: 'You land in the discovery feed with a followed tutor and some reading history. Rate articles, browse modules, explore. No card needed.',
    submitLabel: 'Take me into the demo',
  },
};

const Try = ({ role }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, token } = useAuth();
  const { isDemo, demoRole, loading: demoLoading } = useDemo();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bouncedRef = useRef(false);
  const [readyRef, readyVisible] = useReveal();

  const copy = ROLE_COPY[role] || ROLE_COPY.tutor;

  // If they're already signed in (demo or real), bounce them into the
  // app. The ref guards against re-bouncing on re-renders.
  useEffect(() => {
    if (bouncedRef.current) return;
    if (demoLoading) return;
    if (token) {
      bouncedRef.current = true;
      if (isDemo) {
        navigate(_redirectForRole(demoRole || role), { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [token, isDemo, demoRole, demoLoading, role, navigate]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await client.post('/demo/enter', {
        email: email.trim(),
        role,
      });
      // Cookie is set by the response. Calling login('') re-triggers
      // the auth bootstrap so /users/me reads back the new session.
      login('');
      const dest = res.data?.redirect_path || _redirectForRole(role);
      // Tutor lands on a tenant subdomain; that requires a full-page
      // nav so the browser actually crosses origins (react-router
      // would leave us stranded on the apex).
      if (/^https?:\/\//i.test(dest)) {
        window.location.assign(dest);
      } else {
        navigate(dest, { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not enter the demo.'));
      setBusy(false);
    }
  };

  return (
    <main className="font-sans bg-kotoba-background min-h-screen text-kotoba-text relative isolate">
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
        <div
          className="v2-mesh-blob"
          style={{
            top: '-15%',
            left: '-10%',
            width: '50%',
            height: '60%',
            background: 'radial-gradient(circle, rgba(214,164,47,0.22), transparent 70%)',
          }}
        />
        <div
          className="v2-mesh-blob v2-mesh-blob-2"
          style={{
            bottom: '-15%',
            right: '-10%',
            width: '50%',
            height: '60%',
            background: 'radial-gradient(circle, rgba(22,86,29,0.10), transparent 70%)',
          }}
        />
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div
          ref={readyRef}
          className={`v2-reveal ${readyVisible ? 'is-revealed' : ''}`}
        >
          <div className="flex justify-center mb-6">
            <Soba size={104} variant="bob" />
          </div>
          <header className="text-center">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              {copy.eyebrow}
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
              {copy.headline}
            </h1>
            <p className="mt-4 text-lg text-kotoba-text/75 leading-relaxed">
              {copy.accent}
            </p>
          </header>

          <form
            onSubmit={submit}
            className="mt-10 bg-white rounded-3xl shadow-soft p-7 sm:p-8 space-y-4"
          >
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55">
                Your email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="mt-2 w-full px-4 py-3 border border-kotoba-text/15 rounded-2xl text-base focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
                disabled={busy}
              />
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-2xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="group w-full inline-flex items-center justify-center px-5 py-3.5 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft-lg hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {busy ? 'Spinning up your workspace…' : copy.submitLabel}
              {!busy && (
                <span
                  className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  →
                </span>
              )}
            </button>

            <p className="text-xs text-kotoba-text/55 leading-relaxed">
              {copy.blurb}
            </p>
          </form>

          <div className="mt-6 text-center text-sm text-kotoba-text/55">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-kotoba-primary hover:underline">
              Sign in
            </Link>
            {' · '}
            <Link
              to={location.pathname === '/try/tutor' ? '/onboarding/tutor' : '/register'}
              className="font-semibold text-kotoba-primary hover:underline"
            >
              Skip the demo
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

// Fallback only — the live redirect URL comes from /demo/enter so the
// tutor branch can carry the tenant subdomain. This is what we use on
// the bounce-back path (user re-lands on /try with a live session) and
// as a defensive default if the server response is missing the field.
// Sending tutors to '/' on the apex is the safe choice here; the demo
// bar will still mount once auth settles and they can navigate from
// there.
const _redirectForRole = (role) => {
  // `role` here is the DEMO persona ('tutor' | 'creator' | 'student'),
  // not the User.role enum. Both demo flows are backed by UserRole.TUTOR
  // server-side after the 2026-06-09 rename, but the redirect target
  // still differs: a "tutor" demo gets a tenant subdomain, a "creator"
  // demo lands on the apex teacher dashboard.
  if (role === 'tutor') return '/';
  if (role === 'creator') return '/teacher/dashboard';
  return '/discover';
};

export default Try;
