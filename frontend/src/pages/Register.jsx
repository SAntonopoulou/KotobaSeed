import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const initialForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'student',
  gdpr_consent: false,
  // Tutor-only fields, ignored unless role === 'tutor'
  tutor_slug: '',
  display_name: '',
  languages_taught: '',
  timezone: 'Europe/Athens',
};

const slugify = (raw) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const ROLE_LABELS = {
  student: 'Student — I want to learn',
  creator: 'Creator — I make comprehensible-input content for the marketplace',
  tutor: 'Tutor — I want my own teaching site for one-to-one lessons',
};

const Register = () => {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();
  const [params] = useSearchParams();
  // Referral code from `?ref=XYZ` — sent on signup so the platform can
  // stamp an attribution. Uppercased to match how codes are stored.
  const refCode = (params.get('ref') || '').toUpperCase().trim() || null;

  const slug = useMemo(() => slugify(form.tutor_slug), [form.tutor_slug]);
  const slugPreview = slug ? `${slug}.kotobaseed.net` : 'yourname.kotobaseed.net';

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.gdpr_consent) {
      setError('Please confirm consent to continue.');
      return;
    }

    try {
      if (form.role === 'tutor') {
        if (slug.length < 3) {
          setError('Pick a slug at least 3 characters long.');
          return;
        }
        if (!form.display_name.trim()) {
          setError('Display name is required.');
          return;
        }
        const payload = {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          tutor_slug: slug,
          display_name: form.display_name.trim(),
          languages_taught: form.languages_taught || null,
          timezone: form.timezone || 'UTC',
          gdpr_consent: true,
          ref_code: refCode,
        };
        const res = await client.post('/onboarding/tutor', payload);
        const { access_token, onboarding_url } = res.data || {};
        if (access_token) login(access_token);
        if (onboarding_url) {
          window.location.href = onboarding_url;
          return;
        }
        navigate('/onboarding/return');
        return;
      }

      // Student or Creator: regular /auth/register
      const res = await client.post('/auth/register', {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: form.role,
        gdpr_consent: true,
        ref_code: refCode,
      });
      const token = res?.data?.access_token;
      if (token) login(token);
      navigate('/verify-email');
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create a new account
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded relative" role="alert">
                <span className="block sm:inline">{error}</span>
              </div>
            )}
            {refCode && (
              <div className="bg-kotoba-primary/10 border border-kotoba-primary/30 text-kotoba-primary px-4 py-2 rounded text-sm">
                You're signing up via referral code <strong>{refCode}</strong>. Once you complete your first paid lesson, your friend earns a reward.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">I am a…</label>
              <div className="mt-2 space-y-2">
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer text-sm ${
                      form.role === value
                        ? 'border-kotoba-primary bg-kotoba-primary/5'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={form.role === value}
                      onChange={handleChange}
                      className="mt-0.5 h-4 w-4 text-kotoba-primary border-gray-300 focus:ring-kotoba-primary"
                    />
                    <span className="text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                value={form.full_name}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={form.password}
                onChange={handleChange}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm"
              />
            </div>

            {form.role === 'tutor' && (
              <div className="border-t pt-4 space-y-4">
                <p className="text-sm font-medium text-gray-700">Your tutor site</p>

                <div>
                  <label htmlFor="display_name" className="block text-xs font-medium text-gray-500 mb-1">
                    Display name (shown on your site)
                  </label>
                  <input
                    id="display_name"
                    name="display_name"
                    type="text"
                    required
                    value={form.display_name}
                    onChange={handleChange}
                    placeholder="Vasso"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="tutor_slug" className="block text-xs font-medium text-gray-500 mb-1">
                    Slug
                  </label>
                  <div className="flex rounded-md overflow-hidden border border-gray-300 focus-within:ring-2 focus-within:ring-kotoba-primary">
                    <input
                      id="tutor_slug"
                      name="tutor_slug"
                      type="text"
                      required
                      value={form.tutor_slug}
                      onChange={handleChange}
                      placeholder="vasso"
                      autoCapitalize="none"
                      className="flex-1 px-3 py-2 focus:outline-none text-sm"
                    />
                    <span className="bg-gray-50 text-gray-500 px-3 py-2 text-sm self-stretch flex items-center">
                      .kotobaseed.net
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Site URL: <span className="font-medium text-kotoba-primary">{slugPreview}</span>
                  </p>
                </div>

                <div>
                  <label htmlFor="languages_taught" className="block text-xs font-medium text-gray-500 mb-1">
                    Languages you teach (optional)
                  </label>
                  <input
                    id="languages_taught"
                    name="languages_taught"
                    type="text"
                    value={form.languages_taught}
                    onChange={handleChange}
                    placeholder="Greek, English"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm"
                  />
                </div>

                <p className="text-xs text-gray-500">
                  After signing up you'll go through a quick Stripe identity check. Nothing is published until you finish it.
                </p>
              </div>
            )}

            <label className="flex items-start gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                name="gdpr_consent"
                checked={form.gdpr_consent}
                onChange={handleChange}
                className="mt-1 h-4 w-4 text-kotoba-primary border-gray-300 rounded focus:ring-kotoba-primary"
              />
              <span>
                I agree to Kotobaseed processing my data to provide the platform, per the Privacy Policy. I can delete my account any time.
              </span>
            </label>

            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-kotoba-primary"
            >
              {form.role === 'tutor' ? 'Continue to Stripe Connect' : 'Register'}
            </button>

            <p className="text-sm text-center text-kotoba-text/70">
              Already have an account?{' '}
              <Link to="/login" className="text-kotoba-primary font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register;
