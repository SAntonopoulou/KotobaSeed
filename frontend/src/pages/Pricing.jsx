import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useReveal } from '../hooks/landingAnimations';
import { getErrorMessage } from '../utils/errors';

// Pricing page. Two clearly-labeled audiences:
//   For students  → Plus
//   For tutors    → Free, Pro, Business
//
// Monthly / annual toggle. Trial messaging on Pro + Business. Card-on-file
// disclaimer is shown explicitly so the 14-day trial behaviour is not a
// surprise.

// Annual prices are total /yr. Per-month figures derive from
// annualTotal / 12 and are deliberately chosen to round to whole
// euros — no cents on display anywhere.

const STUDENT_TIERS = [
  {
    id: 'plus',
    name: 'Plus',
    audience: 'For engaged students',
    monthly: 9,
    annualTotal: 84,        // €7/mo billed yearly
    annualPerMo: 7,
    blurb: 'Priority booking + premium content from every tutor.',
    features: [
      'Priority booking credits (one per month)',
      'Premium articles and modules from any tutor',
      'Plus badge on your profile',
      'If you also tutor: 600 classroom min/mo',
    ],
    cta: { label: 'Get Plus', planId: 'plus' },
  },
];

const TUTOR_TIERS = [
  {
    id: 'free',
    name: 'Free',
    audience: 'For hobby tutors getting started',
    monthly: 0,
    annualTotal: 0,
    annualPerMo: 0,
    blurb: 'Try the platform. Pay only when you teach.',
    features: [
      'Your own yourname.kotobaseed.net site',
      'Full booking + Stripe payouts',
      '15% platform fee per lesson',
      '240 classroom min/mo',
      'Basic theme + page layout',
    ],
    cta: { label: 'Start free', planId: null, freeSignup: true },
  },
  {
    id: 'pro',
    name: 'Pro',
    audience: 'For full-time independent tutors',
    monthly: 39,
    annualTotal: 348,       // €29/mo billed yearly, save €120
    annualPerMo: 29,
    highlight: true,
    trial: true,
    blurb: 'Everything you need to run your business. 0% lesson fee.',
    features: [
      '0% platform fee on lessons',
      '3,000 classroom min/mo (top-up packs available)',
      'Theme picker + page builder + custom domain',
      'Verified credential badges on your site',
      'Articles, modules, premium content monetisation',
      'Group classes + recurring weekly bookings',
      'Email support',
    ],
    cta: { label: 'Start 14-day trial', planId: 'pro' },
  },
  {
    id: 'business',
    name: 'Business',
    audience: 'For language schools',
    monthly: 149,
    annualTotal: 1428,      // €119/mo billed yearly, save €360
    annualPerMo: 119,
    trial: true,
    blurb: 'White-label, multi-seat, priority support.',
    features: [
      'Everything in Pro',
      '5 tutor seats',
      '15,000 classroom min/mo (effectively unlimited)',
      'No Kotobaseed branding on student-facing pages',
      'Priority email support',
      'Custom roll-out help on request',
    ],
    cta: { label: 'Start 14-day trial', planId: 'business' },
  },
];

// Compute the savings story used in the toggle + per-card chip.
const annualSavings = (tier) => {
  if (!tier.monthly) return 0;
  return tier.monthly * 12 - tier.annualTotal;
};
const annualSavingsPct = (tier) => {
  if (!tier.monthly) return 0;
  return Math.round((1 - tier.annualTotal / (tier.monthly * 12)) * 100);
};

const RevealBlock = ({ children, delay = 0, className = '' }) => {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={`v2-reveal ${visible ? 'is-revealed' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
};

const Check = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="2.2"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4 mt-0.5 flex-shrink-0 text-kotoba-primary"
    aria-hidden="true"
  >
    <path d="M5 12l5 5L20 7" />
  </svg>
);

const TierCard = ({ tier, billing }) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const isFree = tier.monthly === 0;
  const isAnnual = billing === 'annual';
  const displayPrice = isAnnual ? tier.annualPerMo : tier.monthly;
  const savings = annualSavings(tier);

  const startCheckout = async () => {
    if (!currentUser) {
      navigate('/register?next=/pricing');
      return;
    }
    if (tier.cta.freeSignup) {
      navigate('/onboarding/tutor');
      return;
    }
    setBusy(true);
    try {
      const res = await client.post('/subscriptions/checkout', {
        plan: tier.cta.planId,
        billing,
      });
      window.location.href = res.data.checkout_url;
    } catch (err) {
      alert(getErrorMessage(err, 'Could not start checkout. Please try again.'));
      setBusy(false);
    }
  };

  return (
    <div
      className={
        'relative rounded-3xl p-7 flex flex-col h-full transition-all duration-500 ease-soft hover:-translate-y-1 ' +
        (tier.highlight
          ? 'bg-white border-2 border-kotoba-secondary shadow-soft-lg hover:shadow-soft-glow'
          : 'bg-white border border-kotoba-text/[0.08] shadow-soft hover:shadow-soft-lg')
      }
    >
      {tier.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-block px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.18em] font-bold bg-kotoba-secondary text-kotoba-text shadow-soft">
          Most popular
        </span>
      )}
      <h3 className="font-display text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
        {tier.name}
      </h3>
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55 mt-1.5">
        {tier.audience}
      </p>

      <div className="mt-5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-5xl font-bold text-kotoba-primary tabular-nums tracking-[-0.02em]">
            €{displayPrice}
          </span>
          {!isFree && (
            <span className="text-sm text-kotoba-text/60">
              {isAnnual ? '/mo · billed yearly' : '/mo'}
            </span>
          )}
        </div>
        {!isFree && isAnnual && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-kotoba-text/55">
              <span className="line-through">€{tier.monthly}/mo</span>{' '}
              · €{tier.annualTotal}/yr
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-primary bg-kotoba-primary/10 px-2 py-0.5 rounded">
              Save €{savings}/yr
            </span>
          </div>
        )}
      </div>

      {tier.trial && (
        <p className="text-xs font-semibold text-kotoba-secondary-dark mt-3">
          14 days free, card on file
        </p>
      )}
      <p className="text-sm text-kotoba-text/80 mt-4 leading-relaxed">{tier.blurb}</p>
      <ul className="mt-5 space-y-2.5 text-sm text-kotoba-text/85 flex-grow">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={startCheckout}
        disabled={busy}
        className={
          'group mt-7 inline-flex items-center justify-center px-6 py-3 rounded-2xl font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-50 disabled:hover:translate-y-0 ' +
          (tier.highlight
            ? 'bg-kotoba-primary text-white'
            : 'bg-kotoba-secondary text-kotoba-text')
        }
      >
        {busy ? 'Opening checkout…' : tier.cta.label}
        {!busy && (
          <span
            className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden="true"
          >
            →
          </span>
        )}
      </button>
    </div>
  );
};

const Pricing = () => {
  // Default to annual — the savings story is the conversion lever, so
  // we lead with it. Visitors who only want monthly toggle in one click.
  const [billing, setBilling] = useState('annual');
  const maxSavingsPct = Math.max(
    ...TUTOR_TIERS.map(annualSavingsPct),
    ...STUDENT_TIERS.map(annualSavingsPct),
  );

  return (
    <main className="font-sans bg-kotoba-background min-h-screen text-kotoba-text relative isolate">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[60vh] -z-10 overflow-hidden">
        <div
          className="v2-mesh-blob"
          style={{
            top: '-10%',
            left: '20%',
            width: '60%',
            height: '60%',
            background:
              'radial-gradient(circle, rgba(214,164,47,0.18), transparent 70%)',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <RevealBlock>
          <header className="text-center max-w-3xl mx-auto">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              Pricing
            </p>
            <h1 className="mt-3 font-display text-5xl sm:text-6xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
              Fair for tutors.{' '}
              <span className="italic text-kotoba-secondary-dark">Friendly for students.</span>
            </h1>
            <p className="mt-5 text-lg text-kotoba-text/75 leading-relaxed max-w-2xl mx-auto">
              Tutors pay €0 to start, or upgrade for a flat monthly fee and keep 100% of your
              lesson revenue. Students get one tier that unlocks extras across every tutor.
            </p>
            <div className="mt-8 inline-flex items-center bg-white rounded-full p-1 shadow-soft">
              <button
                type="button"
                onClick={() => setBilling('annual')}
                className={
                  'px-5 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ' +
                  (billing === 'annual'
                    ? 'bg-kotoba-primary text-white shadow-soft'
                    : 'text-kotoba-text/65 hover:text-kotoba-text')
                }
              >
                Annual
                <span
                  className={
                    'text-[10px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ' +
                    (billing === 'annual'
                      ? 'bg-kotoba-secondary text-kotoba-text'
                      : 'bg-kotoba-secondary/40 text-kotoba-text/85')
                  }
                >
                  Save up to {maxSavingsPct}%
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBilling('monthly')}
                className={
                  'px-5 py-1.5 rounded-full text-sm font-semibold transition-all ' +
                  (billing === 'monthly'
                    ? 'bg-kotoba-primary text-white shadow-soft'
                    : 'text-kotoba-text/65 hover:text-kotoba-text')
                }
              >
                Monthly
              </button>
            </div>
          </header>
        </RevealBlock>

        {/* Tutors */}
        <section className="mt-16 sm:mt-20">
          <RevealBlock>
            <div className="flex items-end justify-between gap-3 flex-wrap mb-8">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                  For tutors
                </p>
                <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
                  Pick your plan
                </h2>
              </div>
              <Link
                to="/help/tutor-getting-started"
                className="text-sm font-semibold text-kotoba-primary hover:gap-2 gap-1 inline-flex items-center transition-all"
              >
                See the getting-started guide <span aria-hidden="true">→</span>
              </Link>
            </div>
          </RevealBlock>
          <div className="grid gap-6 md:grid-cols-3 pt-3">
            {TUTOR_TIERS.map((t, i) => (
              <RevealBlock key={t.id} delay={i * 80}>
                <TierCard tier={t} billing={billing} />
              </RevealBlock>
            ))}
          </div>
          <p className="mt-8 text-xs text-kotoba-text/60 text-center max-w-2xl mx-auto leading-relaxed">
            Pro and Business trials begin the moment you finish Stripe verification. Your
            card on file is automatically charged on day 14 for the prorated first month,
            then on the same date each month after. Cancel any time during the trial to
            avoid charges. Top-up minute packs are available if you ever exceed your tier
            quota.
          </p>
        </section>

        {/* Students */}
        <section className="mt-20">
          <RevealBlock>
            <div className="text-center mb-8 max-w-2xl mx-auto">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                For students
              </p>
              <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
                One tier. Every tutor.
              </h2>
            </div>
          </RevealBlock>
          <div className="grid gap-6 md:grid-cols-1 max-w-md mx-auto pt-3">
            {STUDENT_TIERS.map((t) => (
              <RevealBlock key={t.id}>
                <TierCard tier={t} billing={billing} />
              </RevealBlock>
            ))}
          </div>
          <p className="mt-8 text-xs text-kotoba-text/60 text-center max-w-2xl mx-auto">
            Plus works on every tutor's site. Cancel any time. No long-term commitment.
          </p>
        </section>

        <RevealBlock>
          <section className="mt-20 bg-white rounded-3xl shadow-soft p-8 sm:p-10 max-w-4xl mx-auto">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              FAQ
            </p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
              Common questions
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 text-sm text-kotoba-text/85">
              {[
                {
                  q: 'What does "0% platform fee" mean?',
                  a: 'On Pro and Business, students pay the full lesson price and 100% goes to you (minus Stripe\'s standard card fee). No additional cut from us.',
                },
                {
                  q: 'Can I switch tiers?',
                  a: 'Yes, any time. Upgrades are prorated; downgrades take effect at the end of your current billing period.',
                },
                {
                  q: 'What if I run out of classroom minutes?',
                  a: 'Buy a top-up pack from your dashboard: 1,000 min for €15 or 5,000 min for €60. Top-ups never expire.',
                },
                {
                  q: 'Do I need to pay VAT?',
                  a: 'We collect VAT on subscriptions where required (handled by Stripe). Lesson payments go directly to you and your VAT obligations there are yours to manage.',
                },
              ].map((item) => (
                <div key={item.q}>
                  <p className="font-display font-bold text-kotoba-primary leading-snug">{item.q}</p>
                  <p className="mt-1.5 text-kotoba-text/75 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </section>
        </RevealBlock>
      </div>
    </main>
  );
};

export default Pricing;
