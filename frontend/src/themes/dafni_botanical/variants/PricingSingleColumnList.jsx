import React, { useMemo, useState } from 'react';
import client from '../../../api/client';

// Pricing — single column, hand-drawn dividers, no ribbon.
//
// Dafni-only. Each offering is a long row in a single centred column,
// separated by a soft botanical squiggle SVG. No "most loved" gold
// ribbon — every option is presented equally calmly.
//
// Hides cleanly when the tutor has nothing active configured (same
// is_active / is_available checks the kotobaseed defaults use).

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'How to learn' },
  title: { type: 'text', max: 100, required: true },
  sub: { type: 'long-text', max: 300 },
  trial_name: { type: 'text', max: 40, default: 'Free trial lesson' },
  trial_desc: { type: 'text', max: 160, default: 'A short first call so we can meet and plan a real starting point. No commitment.' },
  trial_cta: { type: 'text', max: 30, default: 'Book the trial' },
  taster_name_fallback: { type: 'text', max: 40, default: 'A single lesson' },
  taster_desc: { type: 'text', max: 160, default: 'One lesson, paid in full. Use when you want to test the fit before committing.' },
  taster_bullets: {
    type: 'list',
    item: { type: 'text', max: 80 },
    default: ['A {duration}-minute call', 'Audio notes after', 'A simple starting plan'],
  },
  taster_cta: { type: 'text', max: 30, default: 'Book a single lesson' },
  plan_bullets_with_minutes: {
    type: 'list',
    item: { type: 'text', max: 80 },
    default: ['{lessons} a month', 'Homework and audio notes', 'Cancel anytime'],
  },
  plan_bullets_no_minutes: {
    type: 'list',
    item: { type: 'text', max: 80 },
    default: ['Homework and audio notes', 'Cancel anytime'],
  },
  plan_cta_prefix: { type: 'text', max: 24, default: 'Join ' },
  pack_desc_fallback: { type: 'text', max: 160, default: 'A bundle of lessons saved together — yours to use any time.' },
  pack_cta_prefix: { type: 'text', max: 24, default: 'Buy ' },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£' };
const currencySymbol = (code) =>
  CURRENCY_SYMBOL[String(code || 'EUR').toUpperCase()] ?? `${(code || '').toUpperCase()} `;

const formatPrice = (cents, currency) => {
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return `${currencySymbol(currency)}${text}`;
};

const interpolate = (str, vars) => {
  if (typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
};

const Squiggle = () => (
  <span className="d-price-divider" aria-hidden="true">
    <svg width="120" height="22" viewBox="0 0 120 22" fill="none">
      <path
        d="M4 11 C 16 4, 28 18, 40 11 S 64 4, 76 11 S 100 18, 116 11"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  </span>
);

const PricingSingleColumnList = ({
  content = {},
  packs = [],
  singleLesson,
  plan,
  trial,
  onBook,
}) => {
  const [subscribing, setSubscribing] = useState(false);
  const [subError, setSubError] = useState(null);

  const handleSubscribe = async () => {
    if (!plan) return;
    setSubscribing(true);
    setSubError(null);
    try {
      const res = await client.post('/tutor/subscription-plan/subscribe');
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setSubError('Could not start subscription checkout.');
    } catch (err) {
      if (err?.response?.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent('/')}`;
        return;
      }
      setSubError(err?.response?.data?.detail || 'Subscription failed.');
    } finally {
      setSubscribing(false);
    }
  };

  const taster =
    singleLesson && singleLesson.is_active && singleLesson.price_cents != null
      ? singleLesson
      : null;
  const featured = plan && plan.is_available ? plan : null;
  const activePacks = useMemo(() => {
    const active = (packs || []).filter((p) => p?.is_active !== false);
    return [...active].sort((a, b) => (a.num_lessons || 0) - (b.num_lessons || 0));
  }, [packs]);
  const trialPack = trial?.pack || null;

  const offerings = [];
  if (trialPack) offerings.push({ kind: 'trial', data: trialPack });
  if (taster) offerings.push({ kind: 'taster', data: taster });
  for (const p of activePacks) offerings.push({ kind: 'pack', data: p });
  if (featured) offerings.push({ kind: 'plan', data: featured });
  if (offerings.length === 0) return null;

  const title = getValue(content, 'title');
  if (!title) return null;

  return (
    <section id="pricing" className="d-section-sand">
      <div className="d-wrap">
        <div style={{ textAlign: 'center', marginBottom: 24, maxWidth: 600, margin: '0 auto 24px' }}>
          <span className="d-eyebrow">{getValue(content, 'eyebrow')}</span>
          <h2 style={{ fontSize: 'clamp(1.8rem, 1.2rem + 1.6vw, 2.6rem)', margin: '12px 0 0' }}>
            {title}
          </h2>
          {getValue(content, 'sub') && (
            <p style={{ marginTop: 16, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              {getValue(content, 'sub')}
            </p>
          )}
        </div>
        <div className="d-pricing-list">
          {offerings.map(({ kind, data }, idx) => {
            const card = (() => {
              if (kind === 'trial') {
                return (
                  <div className="d-price-row d-price-trial" key="trial">
                    <div className="d-price-head">
                      <h3>{getValue(content, 'trial_name')}</h3>
                      <div className="d-price-amt">
                        Free
                        <span>· {data.duration_minutes || 20} min</span>
                      </div>
                    </div>
                    <p className="d-price-desc">{getValue(content, 'trial_desc')}</p>
                    <button
                      type="button"
                      onClick={() => onBook?.({ ...data, isTrial: true })}
                      className="d-btn d-btn-outline"
                    >
                      {getValue(content, 'trial_cta')}
                    </button>
                  </div>
                );
              }
              if (kind === 'taster') {
                const bullets = (getValue(content, 'taster_bullets') || []).map((b) =>
                  interpolate(b, { duration: data.duration_minutes || 50 }),
                );
                return (
                  <div className="d-price-row" key="taster">
                    <div className="d-price-head">
                      <h3>{data.name || getValue(content, 'taster_name_fallback')}</h3>
                      <div className="d-price-amt">
                        {formatPrice(data.price_cents, data.currency)}
                        <span>· one off</span>
                      </div>
                    </div>
                    <p className="d-price-desc">{getValue(content, 'taster_desc')}</p>
                    <ul className="d-price-bullets">
                      {bullets.map((it) => <li key={it}>{it}</li>)}
                    </ul>
                    <button
                      type="button"
                      onClick={() => onBook?.({ ...data, isTrial: false })}
                      className="d-btn d-btn-outline"
                    >
                      {getValue(content, 'taster_cta')}
                    </button>
                  </div>
                );
              }
              if (kind === 'plan') {
                const bulletTemplates =
                  data.lessons_per_month && data.lessons_per_month > 0
                    ? getValue(content, 'plan_bullets_with_minutes')
                    : getValue(content, 'plan_bullets_no_minutes');
                const bullets = (bulletTemplates || []).map((b) =>
                  interpolate(b, {
                    lessons: `${data.lessons_per_month} lesson${data.lessons_per_month === 1 ? '' : 's'}`,
                  }),
                );
                return (
                  <div className="d-price-row d-price-featured" key="plan">
                    <span className="d-price-featured-eyebrow">Most chosen</span>
                    <div className="d-price-head">
                      <h3>{data.name || 'Membership'}</h3>
                      <div className="d-price-amt">
                        {formatPrice(data.price_cents, data.currency)}
                        <span>/ month</span>
                      </div>
                    </div>
                    {data.description && data.description.indexOf('\n') === -1 && (
                      <p className="d-price-desc">{data.description}</p>
                    )}
                    <ul className="d-price-bullets">
                      {bullets.map((it) => <li key={it}>{it}</li>)}
                    </ul>
                    <button
                      type="button"
                      onClick={handleSubscribe}
                      disabled={subscribing}
                      className="d-btn d-btn-primary"
                    >
                      {subscribing
                        ? 'Loading…'
                        : `${getValue(content, 'plan_cta_prefix')}${data.name || 'Membership'}`}
                    </button>
                    {subError && (
                      <p style={{ color: 'var(--brand-hover)', marginTop: 8, fontSize: 14 }}>
                        {subError}
                      </p>
                    )}
                  </div>
                );
              }
              // pack
              return (
                <div className="d-price-row" key={data.id}>
                  <div className="d-price-head">
                    <h3>{data.name || `${data.num_lessons}-lesson bundle`}</h3>
                    <div className="d-price-amt">
                      {formatPrice(data.price_cents, data.currency)}
                      <span>· bundle</span>
                    </div>
                  </div>
                  <p className="d-price-desc">
                    {data.description || getValue(content, 'pack_desc_fallback')}
                  </p>
                  <ul className="d-price-bullets">
                    <li>{data.num_lessons || 1} lesson{(data.num_lessons || 1) === 1 ? '' : 's'}</li>
                    <li>{data.duration_minutes || 50} minutes each</li>
                    <li>Use any time</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => onBook?.({ ...data, isTrial: false })}
                    className="d-btn d-btn-outline"
                  >
                    {getValue(content, 'pack_cta_prefix')}{data.name || 'bundle'}
                  </button>
                </div>
              );
            })();
            return (
              <React.Fragment key={`${kind}-${idx}`}>
                {card}
                {idx < offerings.length - 1 && <Squiggle />}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PricingSingleColumnList;
