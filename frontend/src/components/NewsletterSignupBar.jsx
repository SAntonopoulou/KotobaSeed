import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Slim newsletter signup bar designed to sit in a footer. Single-line
// email + button + an inline consent checkbox. Double-opt-in just like
// the card variant; the row only joins the broadcast audience after the
// visitor clicks the link in the confirmation email.

const NewsletterSignupBar = ({
  tutorSlug,
  className = '',
  style = {},
  // optional override styles when a theme wants different palette
  styles: stylesOverride = {},
}) => {
  const [prefs, setPrefs] = useState(null);
  const [form, setForm] = useState({ email: '', gdpr_consent: false });
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
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tutorSlug]);

  if (!prefs || !prefs.enabled || !prefs.show_in_footer) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.gdpr_consent) {
      setError('Tick the consent box first.');
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
          gdpr_consent: form.gdpr_consent,
        },
      );
      setSuccess(res.data?.message || 'Check your inbox to confirm.');
      setForm({ email: '', gdpr_consent: false });
    } catch (err) {
      setError(
        err?.response?.data?.detail || 'Could not sign up — try again later.',
      );
    } finally {
      setBusy(false);
    }
  };

  // Bar uses CSS variables that the themed layouts already set up
  // (--brand, --fg-muted, --panel-bg). Apex tenants fall back to a
  // muted styling that matches Tailwind tokens via inline RGB.
  const baseStyle = {
    background: 'var(--panel-bg, rgba(0,0,0,0.02))',
    borderTop: '1px solid var(--border, rgba(0,0,0,0.08))',
    padding: '20px 16px',
    ...stylesOverride.section,
    ...style,
  };

  return (
    <div className={className} style={baseStyle}>
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--fg, #2a2725)',
            }}
          >
            {prefs.cta_title}
          </p>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 12.5,
              color: 'var(--fg-muted, #6b6661)',
            }}
          >
            {prefs.cta_description}
          </p>
        </div>
        <form
          onSubmit={submit}
          style={{
            display: 'flex',
            gap: 8,
            flex: '1 1 280px',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}
        >
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
            required
            disabled={busy}
            style={{
              flex: '1 1 180px',
              minWidth: 160,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border, rgba(0,0,0,0.12))',
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              background: 'var(--brand, #7c6f68)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Sending…' : 'Subscribe'}
          </button>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              fontSize: 11.5,
              color: 'var(--fg-muted, #6b6661)',
              flexBasis: '100%',
            }}
          >
            <input
              type="checkbox"
              checked={form.gdpr_consent}
              onChange={(e) =>
                setForm((f) => ({ ...f, gdpr_consent: e.target.checked }))
              }
              style={{ marginTop: 3 }}
              disabled={busy}
            />
            <span>
              I'm OK with {prefs.tutor_display_name} emailing me. Confirmation link first; unsubscribe any time.
            </span>
          </label>
          {error && (
            <p style={{ flexBasis: '100%', margin: 0, fontSize: 12, color: '#b91c1c' }}>
              {error}
            </p>
          )}
          {success && (
            <p style={{ flexBasis: '100%', margin: 0, fontSize: 12, color: '#166534' }}>
              {success}
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default NewsletterSignupBar;
