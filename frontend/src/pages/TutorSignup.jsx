import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const initialForm = {
  email: '',
  password: '',
  full_name: '',
  display_name: '',
  tutor_slug: '',
  languages_taught: '',
  timezone: 'Europe/Athens',
  gdpr_consent: false,
};

const slugify = (raw) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const TutorSignup = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const slug = useMemo(() => slugify(form.tutor_slug), [form.tutor_slug]);
  const slugPreview = slug ? `${slug}.kotobaseed.net` : 'yourname.kotobaseed.net';

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.gdpr_consent) {
      setError('Please tick the consent box to continue.');
      return;
    }
    if (slug.length < 3) {
      setError('Pick a slug at least 3 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...form, tutor_slug: slug };
      const res = await client.post('/onboarding/tutor', payload);
      const { access_token, onboarding_url } = res.data;
      if (access_token) {
        login(access_token);
      }
      if (onboarding_url) {
        window.location.href = onboarding_url;
      } else {
        navigate('/onboarding/return');
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Could not create your account.';
      setError(typeof detail === 'string' ? detail : 'Could not create your account.');
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-kotoba-background min-h-screen py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-kotoba-primary">Set up your tutor site</h1>
          <p className="mt-3 text-kotoba-text">
            About five minutes. You'll be on Stripe Connect for the last step (identity check).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-10 bg-white rounded-2xl shadow-md p-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="full_name">
              Your full name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              value={form.full_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary focus:border-transparent"
              placeholder="Vasso Antonopoulou"
              autoComplete="name"
            />
            <p className="mt-1 text-xs text-kotoba-text/60">For tax and Stripe verification — students see your display name instead.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="display_name">
              Display name
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              required
              value={form.display_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary focus:border-transparent"
              placeholder="Vasso"
            />
            <p className="mt-1 text-xs text-kotoba-text/60">The name above your photo on your site.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="tutor_slug">
              Your slug
            </label>
            <div className="flex rounded-md overflow-hidden border border-kotoba-text/20 focus-within:ring-2 focus-within:ring-kotoba-primary">
              <input
                id="tutor_slug"
                name="tutor_slug"
                type="text"
                required
                value={form.tutor_slug}
                onChange={handleChange}
                className="flex-1 px-3 py-2 focus:outline-none"
                placeholder="vasso"
                autoCapitalize="none"
                autoComplete="off"
              />
              <span className="bg-kotoba-background text-kotoba-text/70 px-3 py-2 text-sm self-stretch flex items-center">
                .kotobaseed.net
              </span>
            </div>
            <p className="mt-1 text-xs text-kotoba-text/60">
              Your site lives at <span className="font-medium text-kotoba-primary">{slugPreview}</span>. Letters, numbers, and hyphens only.
            </p>
          </div>

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
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary focus:border-transparent"
              placeholder="Greek, English"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary focus:border-transparent"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary focus:border-transparent"
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-kotoba-text/60">At least 8 characters.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="timezone">
              Timezone
            </label>
            <input
              id="timezone"
              name="timezone"
              type="text"
              value={form.timezone}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary focus:border-transparent"
              placeholder="Europe/Athens"
            />
            <p className="mt-1 text-xs text-kotoba-text/60">Used so emails arrive at sensible times.</p>
          </div>

          <label className="flex items-start gap-3 text-sm text-kotoba-text">
            <input
              type="checkbox"
              name="gdpr_consent"
              checked={form.gdpr_consent}
              onChange={handleChange}
              className="mt-1 h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
            />
            <span>
              I agree to Kotobaseed processing my data to provide the platform, per the Privacy Policy. I understand I can delete my account at any time.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Setting things up…' : 'Continue to Stripe Connect'}
          </button>

          <p className="text-xs text-kotoba-text/60 text-center">
            After this form you'll go through a quick Stripe identity check. Nothing is published until you finish it.
          </p>
        </form>
      </div>
    </div>
  );
};

export default TutorSignup;
