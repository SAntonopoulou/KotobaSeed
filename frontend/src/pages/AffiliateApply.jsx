import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';

const AffiliateApply = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    website_url: '',
    audience_description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.audience_description.length < 20) {
      setError('Please describe your audience in a sentence or two.');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/affiliates/apply', form);
      setSubmitted(true);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not submit your application.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <h1 className="text-2xl font-bold text-kotoba-primary mb-3">Thanks!</h1>
          <p className="text-kotoba-text mb-4">
            Your application is in the review queue. We aim to reply within a week. You'll receive an email at the address on your account when there's a decision.
          </p>
          <Link
            to="/referrals"
            className="text-kotoba-primary hover:underline"
          >
            Back to your referrals
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-kotoba-primary">Affiliate application</h1>
        <p className="text-sm text-kotoba-text/70 mt-2">
          Run a blog, YouTube channel, or community in language learning? Apply to the affiliate program and earn <strong>€50 per qualifying tutor</strong> + <strong>€10 per qualifying student</strong> you refer. Bigger commissions than the peer program, paid as monthly transfers.
        </p>
      </header>

      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="website_url">
            Website or channel URL
          </label>
          <input
            id="website_url"
            type="url"
            required
            value={form.website_url}
            onChange={(e) => setForm({ ...form, website_url: e.target.value })}
            placeholder="https://yourchannel.example"
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="audience">
            Tell us about your audience
          </label>
          <textarea
            id="audience"
            rows={5}
            required
            minLength={20}
            value={form.audience_description}
            onChange={(e) => setForm({ ...form, audience_description: e.target.value })}
            placeholder="Who reads / watches you? Roughly how many? What kind of language-learning content do you share?"
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      </form>
    </main>
  );
};

export default AffiliateApply;
