import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { apexUrl } from '../hooks/useTenant';
import LessonPackManager from '../components/LessonPackManager';
import BookingsManager from '../components/BookingsManager';
import AvailabilityEditor from '../components/AvailabilityEditor';
import TrialSettings from '../components/TrialSettings';

// Pull the token out of the URL fragment (#token=...) if present, store it,
// then scrub the URL so the token doesn't sit in the address bar.
const claimTokenFromHash = (login) => {
  if (typeof window === 'undefined' || !window.location.hash) return false;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('token');
  if (!token) return false;
  login(token);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
};

const STRIPE_EXPRESS_DASHBOARD = 'https://dashboard.stripe.com/express';

const TutorDashboard = () => {
  const navigate = useNavigate();
  const { token, login, logout } = useAuth();
  const [tutor, setTutor] = useState(null);
  const [form, setForm] = useState({
    display_name: '',
    bio: '',
    photo_url: '',
    languages_taught: '',
    languages_spoken: '',
    public_reply_email: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [tokenClaimed, setTokenClaimed] = useState(false);

  // Take the token from #token= on the first render if present. We do this
  // synchronously before the auth check below so a fresh-from-Stripe user
  // doesn't bounce to /login.
  useMemo(() => {
    const claimed = claimTokenFromHash(login);
    if (claimed) setTokenClaimed(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Without a token there's nothing to load — send them to login.
    if (!token && !tokenClaimed) {
      navigate('/login');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/tutor/me');
        if (!cancelled) {
          setTutor(res.data);
          setForm({
            display_name: res.data.display_name || '',
            bio: res.data.bio || '',
            photo_url: res.data.photo_url || '',
            languages_taught: res.data.languages_taught || '',
            languages_spoken: res.data.languages_spoken || '',
            public_reply_email: res.data.public_reply_email || '',
          });
        }
      } catch (err) {
        if (!cancelled) {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            navigate('/login');
            return;
          }
          setError(err?.response?.data?.detail || 'Could not load your tutor profile.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tokenClaimed, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Only send fields that have values (PATCH semantics — backend uses
      // exclude_unset).
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== '')
      );
      const res = await client.patch('/tutor/me', payload);
      setTutor(res.data);
      setSavedAt(new Date());
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !tutor) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-kotoba-primary mb-2">Couldn't load</h1>
          <p className="text-kotoba-text">{error}</p>
        </div>
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center">
        <p className="text-kotoba-text">Loading…</p>
      </div>
    );
  }

  const isPaused = tutor.account_status !== 'active';

  return (
    <div className="bg-kotoba-background min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <a
              href={apexUrl('/')}
              className="text-xs uppercase tracking-wider text-kotoba-text/50 hover:text-kotoba-primary"
              title="Browse Kotobaseed"
            >
              Kotobaseed
            </a>
            <span className="text-kotoba-text/30">·</span>
            <div>
              <span className="text-xl font-semibold text-kotoba-primary">{tutor.display_name}</span>
              <span className="ml-3 text-sm text-kotoba-text/60">Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-sm text-kotoba-primary hover:underline">
              View your site
            </a>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="text-sm text-kotoba-text/70 hover:text-kotoba-text"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Onboarding status banner */}
        <section className={`rounded-2xl p-6 ${isPaused ? 'bg-kotoba-secondary/20' : 'bg-white shadow-sm'}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-kotoba-primary">
                {isPaused ? 'Stripe verification pending' : 'Your site is live'}
              </h2>
              <p className="mt-1 text-sm text-kotoba-text">
                {isPaused
                  ? 'Finish Stripe identity verification to start taking bookings.'
                  : 'Bookings and payments are turned on.'}
              </p>
              {tutor.stripe_connect_account_id && (
                <p className="mt-2 text-xs text-kotoba-text/60 font-mono">
                  Stripe account: {tutor.stripe_connect_account_id}
                </p>
              )}
            </div>
            <a
              href={STRIPE_EXPRESS_DASHBOARD}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary hover:text-white transition-colors"
            >
              Open Stripe dashboard
            </a>
          </div>
        </section>

        {/* Profile editor */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-kotoba-primary mb-4">Your profile</h2>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
          {savedAt && !error && (
            <div className="mb-4 bg-kotoba-primary/10 text-kotoba-primary px-4 py-3 rounded-md text-sm">
              Saved at {savedAt.toLocaleTimeString()}.
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="display_name">
                Display name
              </label>
              <input
                id="display_name"
                name="display_name"
                type="text"
                value={form.display_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="bio">
                Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                value={form.bio}
                onChange={handleChange}
                rows={5}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
              <p className="mt-1 text-xs text-kotoba-text/60">Appears on your public site. Line breaks are preserved.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="photo_url">
                Photo URL
              </label>
              <input
                id="photo_url"
                name="photo_url"
                type="url"
                value={form.photo_url}
                onChange={handleChange}
                placeholder="https://…"
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
              <p className="mt-1 text-xs text-kotoba-text/60">
                Hosted image URL. File uploads land in a later step.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="languages_taught">
                  Languages you teach
                </label>
                <input
                  id="languages_taught"
                  name="languages_taught"
                  type="text"
                  value={form.languages_taught}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="languages_spoken">
                  Languages you speak
                </label>
                <input
                  id="languages_spoken"
                  name="languages_spoken"
                  type="text"
                  value={form.languages_spoken}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="public_reply_email">
                Reply-to email (optional)
              </label>
              <input
                id="public_reply_email"
                name="public_reply_email"
                type="email"
                value={form.public_reply_email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
              <p className="mt-1 text-xs text-kotoba-text/60">
                If set, students replying to your transactional emails reach this address instead of Kotobaseed support.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>

        <BookingsManager />

        <AvailabilityEditor />

        <LessonPackManager />

        <TrialSettings />

        {/* Placeholder for future modules */}
        <section className="bg-white/60 rounded-2xl p-6 text-sm text-kotoba-text">
          <h3 className="font-semibold text-kotoba-primary mb-2">Coming soon</h3>
          <ul className="space-y-1 list-disc list-inside">
            <li>Classroom video (Daily.co rooms per lesson)</li>
            <li>Reschedule and refund-window automations</li>
            <li>Landing-page builder + theme</li>
          </ul>
        </section>
      </main>
    </div>
  );
};

export default TutorDashboard;
