import React, { useMemo, useState } from 'react';
import client from '../../../api/client';

// Pricing — editorial cards side by side. Renders every lesson option
// the tutor has configured, in this order:
//
//   1. Free trial (if `offers_free_trial` is on)
//   2. Single lesson (taster)
//   3. Every active lesson pack, sorted by size
//   4. Membership plan (featured — deep coral panel lifted above row)
//
// The grid auto-wraps; a tutor with one pack sees 4 cards, a tutor with
// four packs sees 7. Membership stays visually featured regardless.
//
// Hides cleanly when the tutor has nothing active configured.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'Ways to study' },
  title: { type: 'text', max: 100, required: true },
  sub: { type: 'long-text', max: 300 },
  // Free trial
  trial_name: { type: 'text', max: 40, default: 'Free trial lesson' },
  trial_desc: { type: 'text', max: 160, default: 'A short first call so we can meet and plan a real starting point. No commitment.' },
  trial_cta: { type: 'text', max: 30, default: 'Book the trial' },
  // Single lesson (taster)
  taster_name_fallback: { type: 'text', max: 40, default: 'A single lesson' },
  taster_desc: { type: 'text', max: 160, default: 'One lesson, paid in full. Use when you want to test the fit before committing.' },
  taster_bullets: {
    type: 'list',
    item: { type: 'text', max: 80 },
    default: ['A {duration}-minute call', 'Audio notes after', 'A simple starting plan'],
  },
  taster_cta: { type: 'text', max: 30, default: 'Book a single lesson' },
  // Subscription / membership plan
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
  // Lesson packs (multi-lesson bundles)
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

const PricingInkwellTrio = ({ content = {}, packs = [], singleLesson, plan, trial, onBook }) => {
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
    <section id="pricing" className="s-section">
      <div className="s-wrap">
        <div style={{ textAlign: 'center', marginBottom: 56, maxWidth: 620, margin: '0 auto 56px' }}>
          <span className="s-eyebrow">{getValue(content, 'eyebrow')}</span>
          <h2 style={{ fontSize: 'clamp(1.8rem, 1.2rem + 1.6vw, 2.6rem)', margin: '12px 0 0' }}>
            {title}
          </h2>
          {getValue(content, 'sub') && (
            <p style={{ marginTop: 16, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              {getValue(content, 'sub')}
            </p>
          )}
        </div>
        <div className="s-pricing">
          {offerings.map(({ kind, data }, idx) => {
            if (kind === 'trial') {
              return (
                <div className="s-price s-price-trial" key="trial">
                  <h3>{getValue(content, 'trial_name')}</h3>
                  <div className="s-price-amt">
                    Free
                    <span>· {data.duration_minutes || 20} min</span>
                  </div>
                  <p className="s-price-desc">{getValue(content, 'trial_desc')}</p>
                  <button
                    type="button"
                    onClick={() => onBook?.({ ...data, isTrial: true })}
                    className="s-btn s-btn-outline"
                    style={{ marginTop: 'auto' }}
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
                <div className="s-price" key="taster">
                  <h3>{data.name || getValue(content, 'taster_name_fallback')}</h3>
                  <div className="s-price-amt">
                    {formatPrice(data.price_cents, data.currency)}
                    <span>· one off</span>
                  </div>
                  <p className="s-price-desc">{getValue(content, 'taster_desc')}</p>
                  <ul className="s-price-bullets">
                    {bullets.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                  <button
                    type="button"
                    onClick={() => onBook?.({ ...data, isTrial: false })}
                    className="s-btn s-btn-outline"
                    style={{ marginTop: 'auto' }}
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
                <div className="s-price s-price-featured" key="plan">
                  <span className="s-price-featured-eyebrow">Most chosen</span>
                  <h3>{data.name || 'Membership'}</h3>
                  <div className="s-price-amt">
                    {formatPrice(data.price_cents, data.currency)}
                    <span>/ month</span>
                  </div>
                  {data.description && data.description.indexOf('\n') === -1 && (
                    <p className="s-price-desc">{data.description}</p>
                  )}
                  <ul className="s-price-bullets">
                    {bullets.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                  <button
                    type="button"
                    onClick={handleSubscribe}
                    disabled={subscribing}
                    className="s-btn s-btn-primary"
                    style={{ marginTop: 'auto' }}
                  >
                    {subscribing
                      ? 'Loading…'
                      : `${getValue(content, 'plan_cta_prefix')}${data.name || 'Membership'}`}
                  </button>
                  {subError && (
                    <p style={{ color: 'var(--coral-200)', marginTop: 8, fontSize: 13 }}>
                      {subError}
                    </p>
                  )}
                </div>
              );
            }
            // pack
            return (
              <div className="s-price" key={data.id}>
                <h3>{data.name || `${data.num_lessons}-lesson bundle`}</h3>
                <div className="s-price-amt">
                  {formatPrice(data.price_cents, data.currency)}
                  <span>· bundle</span>
                </div>
                <p className="s-price-desc">
                  {data.description || getValue(content, 'pack_desc_fallback')}
                </p>
                <ul className="s-price-bullets">
                  <li>{data.num_lessons || 1} lesson{(data.num_lessons || 1) === 1 ? '' : 's'}</li>
                  <li>{data.duration_minutes || 50} minutes each</li>
                  <li>Use any time</li>
                </ul>
                <button
                  type="button"
                  onClick={() => onBook?.({ ...data, isTrial: false })}
                  className="s-btn s-btn-outline"
                  style={{ marginTop: 'auto' }}
                >
                  {getValue(content, 'pack_cta_prefix')}{data.name || 'bundle'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PricingInkwellTrio;
