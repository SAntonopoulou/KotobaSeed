import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Public newsletter signup CTA card. Big, branded, sits near the bottom
// of a tutor's homepage. Uses double-opt-in: submit drops a row in
// TutorNewsletterSubscriber and mails a confirmation link; the row only
// joins the broadcast audience after the visitor clicks confirm.
//
// Honours the tutor's preferences fetched from
// /public/tutors/{slug}/newsletter-prefs — if newsletter_enabled is
// false or show_homepage_section is off, the card hides itself.
//
// `variant` lets each themed layout style the wrapper without forcing a
// duplicate component. Default uses Tailwind apex tokens.

const VARIANT_STYLES = {
  apex: {
    section: 'rounded-3xl bg-gradient-to-br from-kotoba-primary/[0.06] via-white to-kotoba-secondary/15 border border-kotoba-primary/15 p-8 sm:p-10 text-center shadow-soft',
    title: 'font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight',
    description: 'mt-3 text-base text-kotoba-text/75 max-w-xl mx-auto',
    input: 'flex-1 px-4 py-3 rounded-xl border border-kotoba-text/15 focus:outline-none focus:ring-2 focus:ring-kotoba-primary text-sm',
    button: 'px-6 py-3 rounded-xl bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-60 transition-colors',
    success: 'mt-5 text-sm text-green-700',
    error: 'mt-3 text-sm text-red-700',
    fine: 'mt-3 text-xs text-kotoba-text/55',
  },
};

const NewsletterSignupCard = ({
  tutorSlug,
  variant = 'apex',
  className = '',
  style = {},
}) => {
  const [prefs, setPrefs] = useState(null);
  const [form, setForm] = useState({ email: '', name: '', gdpr_consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!tutorSlug) return undefined;
    (async () => {
      try {
        const res = await client.get(
          `/public/tutors/${tutorSlug}/newsletter-prefs`,
        );
        if (!cancelled) setPrefs(res.data);
      } catch {
        // silent — card just won't render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tutorSlug]);

  if (!prefs || !prefs.enabled || !prefs.show_homepage_section) return null;

  const s = VARIANT_STYLES[variant] || VARIANT_STYLES.apex;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.gdpr_consent) {
      setError('Please tick the consent box to continue.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await client.post(
        `/public/tutors/${tutorSlug}/newsletter-subscribe`,
        {
          email: form.email.trim().toLowerCase(),
          name: form.name.trim() || null,
          gdpr_consent: form.gdpr_consent,
        },
      );
      setSuccess(
        res.data?.message
          || 'Almost there — check your inbox to confirm.',
      );
      setForm({ email: '', name: '', gdpr_consent: false });
    } catch (err) {
      setError(
        err?.response?.data?.detail
          || 'Could not sign up — try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${s.section} ${className}`} style={style}>
      <h3 className={s.title}>{prefs.cta_title}</h3>
      <p className={s.description}>{prefs.cta_description}</p>
      <form onSubmit={submit} className="mt-6 max-w-md mx-auto space-y-3">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Your name (optional)"
          autoComplete="name"
          className={s.input}
          disabled={busy}
        />
        <div className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className={s.input}
            disabled={busy}
          />
          <button type="submit" className={s.button} disabled={busy}>
            {busy ? 'Sending…' : 'Subscribe'}
          </button>
        </div>
        <label className="flex items-start gap-2 text-xs text-left max-w-md mx-auto" style={{ color: 'inherit' }}>
          <input
            type="checkbox"
            checked={form.gdpr_consent}
            onChange={(e) =>
              setForm((f) => ({ ...f, gdpr_consent: e.target.checked }))
            }
            className="mt-0.5"
            disabled={busy}
          />
          <span>
            I'm OK with {prefs.tutor_display_name} emailing me. Unsubscribe any time from any email.
          </span>
        </label>
        {error && <p className={s.error}>{error}</p>}
        {success && <p className={s.success}>{success}</p>}
        <p className={s.fine}>
          You'll get a confirmation link first. We never share your email.
        </p>
      </form>
    </section>
  );
};

export default NewsletterSignupCard;
