import React, { useMemo, useState } from 'react';
import { FaCheck } from 'react-icons/fa6';
import client from '../../../api/client';
import { TeaCup, HandDrawnUnderline } from '../Motifs';

// Pricing — Tea Party (v2).
// Mary-only. Honey-wash background with dotted decorations in opposite
// corners. Cards have a small TeaCup motif on top; the featured card
// lifts above the others and wears a tilted honey ribbon. Strict empty-
// state behaviour: when Mary hasn't configured ANY priced offering, the
// whole section disappears.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'Lessons' },
  title: { type: 'text', max: 80, default: 'Pick a lesson that feels right' },
  sub: { type: 'long-text', max: 300, default: 'Honest prices and no lock-in.' },
  featured_ribbon: { type: 'text', max: 28, default: '✿ Most loved' },
  trial_name: { type: 'text', max: 40, default: 'Free trial' },
  trial_desc: { type: 'text', max: 160, default: 'A short first call so we can meet and plan a real starting point.' },
  trial_cta: { type: 'text', max: 30, default: 'Book the trial' },
  taster_name_fallback: { type: 'text', max: 40, default: 'A single lesson' },
  taster_desc: { type: 'text', max: 160, default: 'Pay-as-you-go — no plan, no commitment.' },
  taster_cta: { type: 'text', max: 30, default: 'Book a single lesson' },
  plan_cta_prefix: { type: 'text', max: 24, default: 'Choose ' },
  pack_desc_fallback: { type: 'text', max: 120, default: 'Pre-paid lessons to save a little.' },
  pack_cta_prefix: { type: 'text', max: 24, default: 'Buy ' },
};

const get = (content, key) =>
  (content && content[key] != null ? content[key] : contentSchema[key]?.default);

const CURRENCY = { EUR: '€', USD: '$', GBP: '£' };
const symbol = (code) =>
  CURRENCY[String(code || 'EUR').toUpperCase()] ?? `${(code || '').toUpperCase()} `;
const formatPrice = (cents, currency) => {
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return `${symbol(currency)}${text}`;
};

const PricingTeaParty = ({ content = {}, packs = [], singleLesson, plan, trial, onBook }) => {
  const [subscribing, setSubscribing] = useState(false);
  const [subErr, setSubErr] = useState(null);

  const handleSubscribe = async () => {
    if (!plan) return;
    setSubscribing(true);
    setSubErr(null);
    try {
      const res = await client.post('/tutor/subscription-plan/subscribe');
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setSubErr('Could not start subscription checkout.');
    } catch (err) {
      if (err?.response?.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent('/')}`;
        return;
      }
      setSubErr(err?.response?.data?.detail || 'Subscription failed.');
    } finally {
      setSubscribing(false);
    }
  };

  // Strict guards — only show a card if the tutor has actually set the
  // thing up. Bare existence of the API object is not enough — the
  // backend returns placeholder shells when nothing is configured.
  const taster =
    singleLesson &&
    singleLesson.is_active === true &&
    typeof singleLesson.price_cents === 'number' &&
    singleLesson.price_cents > 0
      ? singleLesson
      : null;
  const featured =
    plan && plan.is_available === true && typeof plan.price_cents === 'number'
      ? plan
      : null;
  const activePacks = useMemo(() => {
    const active = (packs || []).filter(
      (p) =>
        p &&
        p.is_active !== false &&
        typeof p.price_cents === 'number' &&
        p.price_cents > 0,
    );
    return [...active].sort((a, b) => (a.num_lessons || 0) - (b.num_lessons || 0));
  }, [packs]);
  const trialPack = trial?.pack || null;

  const cards = [];
  if (trialPack) cards.push({ kind: 'trial', data: trialPack });
  if (taster) cards.push({ kind: 'taster', data: taster });
  if (featured) cards.push({ kind: 'plan', data: featured });
  for (const p of activePacks) cards.push({ kind: 'pack', data: p });

  // Hide the whole section when Mary hasn't published any offering. No
  // empty grid, no placeholder "soon", nothing — the next section just
  // closes the gap.
  if (cards.length === 0) return null;

  return (
    <section className="m-section m-pricing" id="pricing">
      <div className="m-wrap">
        <div className="m-pricing-head">
          <span className="m-eyebrow">
            {get(content, 'eyebrow')}
            <HandDrawnUnderline className="m-underline" width={120} />
          </span>
          <h2 className="m-title">{get(content, 'title')}</h2>
          {get(content, 'sub') && <p className="m-sub m-sub-center">{get(content, 'sub')}</p>}
        </div>
        {subErr && (
          <p style={{ textAlign: 'center', color: 'var(--brand-hover)', marginBottom: 20 }}>{subErr}</p>
        )}
        <div className="m-pricing-grid">
          {cards.map(({ kind, data }) => {
            if (kind === 'trial') {
              return (
                <article className="m-pack" key="trial">
                  <div className="m-pack-teacup"><TeaCup size={42} /></div>
                  <h3 className="m-pack-name">{get(content, 'trial_name')}</h3>
                  <p className="m-pack-blurb">{get(content, 'trial_desc')}</p>
                  <div className="m-pack-price">Free</div>
                  <div className="m-pack-price-sub">
                    {data.duration_minutes || 20} min · no card needed
                  </div>
                  <button
                    type="button"
                    onClick={() => onBook?.({ ...data, isTrial: true })}
                    className="m-btn m-btn-outline m-pack-cta"
                  >
                    {get(content, 'trial_cta')}
                  </button>
                </article>
              );
            }
            if (kind === 'taster') {
              return (
                <article className="m-pack" key="taster">
                  <div className="m-pack-teacup"><TeaCup size={42} /></div>
                  <h3 className="m-pack-name">{data.name || get(content, 'taster_name_fallback')}</h3>
                  <p className="m-pack-blurb">{get(content, 'taster_desc')}</p>
                  <div className="m-pack-price">{formatPrice(data.price_cents, data.currency)}</div>
                  <div className="m-pack-price-sub">one lesson · {data.duration_minutes || 50} min</div>
                  <button
                    type="button"
                    onClick={() => onBook?.({ ...data, isTrial: false })}
                    className="m-btn m-btn-outline m-pack-cta"
                  >
                    {get(content, 'taster_cta')}
                  </button>
                </article>
              );
            }
            if (kind === 'plan') {
              const lessonsPerMonth =
                data.lessons_per_month && data.lessons_per_month > 0
                  ? data.lessons_per_month
                  : null;
              return (
                <article className="m-pack m-pack-featured" key="plan">
                  <span className="m-pack-ribbon">{get(content, 'featured_ribbon')}</span>
                  <div className="m-pack-teacup"><TeaCup size={46} /></div>
                  <h3 className="m-pack-name">{data.name || 'Membership'}</h3>
                  {data.description && (
                    <p className="m-pack-blurb">{data.description.split('\n')[0]}</p>
                  )}
                  <div className="m-pack-price">
                    {formatPrice(data.price_cents, data.currency)}
                  </div>
                  <div className="m-pack-price-sub">
                    per month{lessonsPerMonth ? ` · ${lessonsPerMonth} lesson${lessonsPerMonth === 1 ? '' : 's'} included` : ''}
                  </div>
                  <ul className="m-pack-feats">
                    {lessonsPerMonth && (
                      <li>
                        <FaCheck size={14} /> {lessonsPerMonth} lesson{lessonsPerMonth === 1 ? '' : 's'} a month
                      </li>
                    )}
                    <li><FaCheck size={14} /> Homework and audio notes</li>
                    <li><FaCheck size={14} /> Cancel any time</li>
                  </ul>
                  <button
                    type="button"
                    onClick={handleSubscribe}
                    disabled={subscribing}
                    className="m-btn m-btn-primary m-pack-cta"
                  >
                    {subscribing ? 'Loading…' : `${get(content, 'plan_cta_prefix')}${data.name || 'membership'}`}
                  </button>
                </article>
              );
            }
            if (kind === 'pack') {
              return (
                <article className="m-pack" key={`pack-${data.id}`}>
                  <div className="m-pack-teacup"><TeaCup size={42} /></div>
                  <h3 className="m-pack-name">{data.name || `${data.num_lessons} lessons`}</h3>
                  <p className="m-pack-blurb">{data.description || get(content, 'pack_desc_fallback')}</p>
                  <div className="m-pack-price">{formatPrice(data.price_cents, data.currency)}</div>
                  <div className="m-pack-price-sub">{data.num_lessons} × {data.duration_minutes} min</div>
                  <button
                    type="button"
                    onClick={() => onBook?.(data)}
                    className="m-btn m-btn-outline m-pack-cta"
                  >
                    {get(content, 'pack_cta_prefix')}{data.num_lessons} lessons
                  </button>
                </article>
              );
            }
            return null;
          })}
        </div>
      </div>
    </section>
  );
};

export default PricingTeaParty;
