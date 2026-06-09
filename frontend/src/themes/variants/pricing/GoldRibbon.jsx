import React, { useMemo, useState } from 'react';
import { FaCheck } from 'react-icons/fa6';
import client from '../../../api/client';

// 3-card pricing grid: taster (single lesson) | featured subscription
// (gold ribbon) | top lesson pack. Wired to the same backend the
// default kotobaseed pricing uses.
//
// Props pulled in by the runtime renderer from the tenant API:
//   packs           — /tutor/lesson-packs
//   singleLesson    — /tutor/single-lesson
//   plan            — /tutor/subscription-plan/public
//   onBook(pack)    — open the booking dialog
//
// All static copy is editable through `content`.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'Simple pricing' },
  title: { type: 'text', max: 80, default: 'Lessons that fit your life' },
  sub: {
    type: 'long-text',
    max: 300,
    default: 'No lock-in, no hidden fees. Just good teaching at a fair price.',
  },
  toggle_monthly: { type: 'text', max: 24, default: 'Monthly' },
  toggle_perlesson: { type: 'text', max: 24, default: 'Pay per lesson' },
  featured_ribbon: { type: 'text', max: 24, default: '★ Most loved' },
  trial_name: { type: 'text', max: 40, default: 'Free trial lesson' },
  trial_desc: { type: 'text', max: 160, default: 'A short first call so we can meet and plan a real starting point.' },
  trial_cta: { type: 'text', max: 30, default: 'Book the trial' },
  taster_name_fallback: { type: 'text', max: 40, default: 'Single lesson' },
  taster_desc: {
    type: 'text',
    max: 120,
    default: 'Pay-as-you-go — no plan, no commitment.',
  },
  taster_bullets: {
    type: 'list',
    item: { type: 'text', max: 80 },
    default: [
      'A {duration}-minute lesson',
      'A friendly first chat',
      'Your starting-level guide',
    ],
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
  plan_cta_prefix: { type: 'text', max: 24, default: 'Choose ' },
  pack_desc_fallback: {
    type: 'text',
    max: 120,
    default: 'Pre-paid lessons to save a little.',
  },
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

// Simple {placeholder} substitution for the bullet templates so the
// admin can tweak phrasing without losing the dynamic numbers.
const interpolate = (str, vars) => {
  if (typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
};

const PricingGoldRibbon = ({
  content = {},
  packs = [],
  singleLesson,
  plan,
  trial,
  onBook,
}) => {
  const [monthly, setMonthly] = useState(true);
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

  // Each offering has its own active flag — the endpoints return
  // placeholder objects even when the tutor has nothing configured, so
  // a naive truthy-check would surface ghost cards. Only push a card
  // when the tutor has actually set the thing up.
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

  const cards = [];
  if (trialPack) cards.push({ kind: 'trial', data: trialPack });
  if (taster) cards.push({ kind: 'taster', data: taster });
  for (const p of activePacks) cards.push({ kind: 'pack', data: p });
  if (featured) cards.push({ kind: 'plan', data: featured });
  if (cards.length === 0) return null;

  return (
    <section id="pricing" className="v-section">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">{getValue(content, 'eyebrow')}</span>
          <h2>{getValue(content, 'title')}</h2>
          <p>{getValue(content, 'sub')}</p>
        </div>
        {featured && (
          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
            <div className="toggle">
              <button className={monthly ? 'on' : ''} onClick={() => setMonthly(true)}>
                {getValue(content, 'toggle_monthly')}
              </button>
              <button className={!monthly ? 'on' : ''} onClick={() => setMonthly(false)}>
                {getValue(content, 'toggle_perlesson')}
              </button>
            </div>
          </div>
        )}
        <div className="price-grid" style={{ marginTop: 36 }}>
          {cards.map(({ kind, data }) => {
            if (kind === 'trial') {
              return (
                <div className="plan plan-trial" key="trial">
                  <h3>{getValue(content, 'trial_name')}</h3>
                  <div className="desc">{getValue(content, 'trial_desc')}</div>
                  <div className="amt">
                    <b>Free</b>
                    <span>{data.duration_minutes || 20} min</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBook?.({ ...data, isTrial: true })}
                    className="v-btn v-btn-secondary"
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
                <div className="plan" key="taster">
                  <h3>{data.name || getValue(content, 'taster_name_fallback')}</h3>
                  <div className="desc">{getValue(content, 'taster_desc')}</div>
                  <div className="amt">
                    <b>{formatPrice(data.price_cents, data.currency)}</b>
                    <span>one-off</span>
                  </div>
                  <ul>
                    {bullets.map((it) => (
                      <li key={it}>
                        <FaCheck size={18} /> {it}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => onBook?.({ ...data, isTrial: false })}
                    className="v-btn v-btn-secondary"
                  >
                    {getValue(content, 'taster_cta')}
                  </button>
                </div>
              );
            }
            if (kind === 'plan') {
              const perLessonCents =
                data.lessons_per_month && data.lessons_per_month > 0
                  ? Math.round(data.price_cents / data.lessons_per_month)
                  : data.price_cents;
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
                <div className="plan feature" key="plan">
                  <div className="rib">{getValue(content, 'featured_ribbon')}</div>
                  <h3>{data.name || 'Membership'}</h3>
                  {data.description && (
                    <div className="desc">{data.description.split('\n')[0]}</div>
                  )}
                  <div className="amt">
                    <b>
                      {formatPrice(monthly ? data.price_cents : perLessonCents, data.currency)}
                    </b>
                    <span>{monthly ? '/ month' : '/ lesson'}</span>
                  </div>
                  <ul>
                    {bullets.map((it) => (
                      <li key={it}>
                        <FaCheck size={18} /> {it}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={handleSubscribe}
                    disabled={subscribing}
                    className="v-btn v-btn-gold"
                  >
                    {subscribing
                      ? 'Loading…'
                      : `${getValue(content, 'plan_cta_prefix')}${data.name || 'Membership'}`}
                  </button>
                  {subError && (
                    <p className="form-error" style={{ marginTop: 8 }}>{subError}</p>
                  )}
                </div>
              );
            }
            return (
              <div className="plan" key={data.id}>
                <h3>{data.name || `${data.num_lessons}-lesson pack`}</h3>
                <div className="desc">
                  {data.description || getValue(content, 'pack_desc_fallback')}
                </div>
                <div className="amt">
                  <b>{formatPrice(data.price_cents, data.currency)}</b>
                  <span>/ pack</span>
                </div>
                <ul>
                  <li>
                    <FaCheck size={18} /> {data.num_lessons || 1} lesson{(data.num_lessons || 1) === 1 ? '' : 's'}
                  </li>
                  <li>
                    <FaCheck size={18} /> {data.duration_minutes || 50} minutes each
                  </li>
                  <li>
                    <FaCheck size={18} /> Use any time
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => onBook?.({ ...data, isTrial: false })}
                  className="v-btn v-btn-secondary"
                >
                  {getValue(content, 'pack_cta_prefix')}
                  {data.name || 'pack'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PricingGoldRibbon;
