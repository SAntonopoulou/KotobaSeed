import React, { useState } from 'react';
import LegalPageLayout, { H2, P } from '../components/LegalPageLayout';
import client from '../api/client';

// DSA Article 16 notice + action form. Anyone — user or non-user — can
// report content they believe is illegal. We capture the report, send it
// to the platform inbox, and surface an acknowledgement.

const ReportContent = () => {
  const [form, setForm] = useState({
    reporter_email: '',
    content_url: '',
    legal_basis: '',
    description: '',
    is_trusted_flagger: false,
    acting_on_behalf_of: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.reporter_email || !form.content_url || !form.description) {
      setError('Email, URL, and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      // Backend endpoint: POST /reports/illegal-content. If it doesn't
      // exist yet, fall back to a clear mailto pointer so the form is
      // never a dead end.
      await client.post('/reports/illegal-content', form);
      setSubmitted(true);
    } catch (err) {
      if (err?.response?.status === 404) {
        setError(
          'The report endpoint is not yet wired. For now, please email your report to report@kotobaseed.net with the same details.',
        );
      } else {
        setError(err?.response?.data?.detail || 'Could not submit. Try emailing report@kotobaseed.net.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <LegalPageLayout
        title="Report illegal content"
        currentSlug="/legal/report-content"
      >
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-green-900">
          <h2 className="font-display text-xl font-semibold mb-2">Report received</h2>
          <P>
            Thank you. We've recorded your report and a moderator will review it shortly. We aim to act within 24 hours for clear cases of illegal content and within 14 days for complex ones. If we need more information we'll email you at the address you provided. We'll also email you our decision and reasoning per Article 16 DSA.
          </P>
        </div>
      </LegalPageLayout>
    );
  }

  return (
    <LegalPageLayout
      title="Report illegal content"
      lastUpdated="2026-06-08"
      currentSlug="/legal/report-content"
    >
      <P>
        Use this form to report content on Kotobaseed that you believe is illegal under EU or member-state law. This is the DSA Article 16 notice channel. For non-illegal-but-disallowed content (spam, abuse, harassment, off-platform solicitation), email <a href="mailto:hello@kotobaseed.net" className="text-kotoba-primary underline">hello@kotobaseed.net</a> instead.
      </P>
      <P>
        You can submit this form anonymously by leaving the email field blank, but we can't give you a status update if you do.
      </P>

      <form onSubmit={handleSubmit} className="space-y-4 mt-6">
        <div>
          <label htmlFor="r-email" className="block text-sm font-medium text-kotoba-text">
            Your email (recommended)
          </label>
          <input
            id="r-email"
            type="email"
            value={form.reporter_email}
            onChange={(e) => update('reporter_email', e.target.value)}
            className="mt-1 w-full rounded-md border border-kotoba-text/20 px-3 py-2 focus:ring-kotoba-primary focus:border-kotoba-primary"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="r-url" className="block text-sm font-medium text-kotoba-text">
            Link to the content (required)
          </label>
          <input
            id="r-url"
            type="url"
            required
            value={form.content_url}
            onChange={(e) => update('content_url', e.target.value)}
            className="mt-1 w-full rounded-md border border-kotoba-text/20 px-3 py-2 focus:ring-kotoba-primary focus:border-kotoba-primary"
            placeholder="https://..."
          />
        </div>
        <div>
          <label htmlFor="r-basis" className="block text-sm font-medium text-kotoba-text">
            Legal basis (if you know one)
          </label>
          <input
            id="r-basis"
            type="text"
            value={form.legal_basis}
            onChange={(e) => update('legal_basis', e.target.value)}
            className="mt-1 w-full rounded-md border border-kotoba-text/20 px-3 py-2 focus:ring-kotoba-primary focus:border-kotoba-primary"
            placeholder="e.g. Copyright infringement, DSA Art 16; GDPR Art 6; CSAM"
          />
        </div>
        <div>
          <label htmlFor="r-desc" className="block text-sm font-medium text-kotoba-text">
            Why is this content illegal? (required)
          </label>
          <textarea
            id="r-desc"
            required
            rows={5}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            className="mt-1 w-full rounded-md border border-kotoba-text/20 px-3 py-2 focus:ring-kotoba-primary focus:border-kotoba-primary"
            placeholder="Describe what's wrong with the content and why it's illegal."
          />
        </div>
        <div>
          <label htmlFor="r-on-behalf" className="block text-sm font-medium text-kotoba-text">
            Acting on behalf of (optional)
          </label>
          <input
            id="r-on-behalf"
            type="text"
            value={form.acting_on_behalf_of}
            onChange={(e) => update('acting_on_behalf_of', e.target.value)}
            className="mt-1 w-full rounded-md border border-kotoba-text/20 px-3 py-2 focus:ring-kotoba-primary focus:border-kotoba-primary"
            placeholder="e.g. Acme Music Ltd, or your own name"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-kotoba-text">
          <input
            type="checkbox"
            checked={form.is_trusted_flagger}
            onChange={(e) => update('is_trusted_flagger', e.target.checked)}
            className="mt-1"
          />
          <span>
            I am submitting this as a trusted flagger designated by a national Digital Services Coordinator under DSA Article 22.
          </span>
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
          <a
            href="mailto:report@kotobaseed.net"
            className="px-5 py-2 rounded-md border border-kotoba-text/20 text-kotoba-text font-medium hover:bg-kotoba-background"
          >
            Email instead
          </a>
        </div>
      </form>

      <H2>What happens next</H2>
      <P>
        We acknowledge reports promptly and act in good faith. For clear illegal-content reports we aim to act within 24 hours; complex cases may take up to 14 days. We will inform you of our decision and the reasons for it. The content owner will be informed of any removal and given a chance to appeal.
      </P>
      <P>
        We do not use solely automated decision-making. Humans review every report and every appeal.
      </P>
    </LegalPageLayout>
  );
};

export default ReportContent;
