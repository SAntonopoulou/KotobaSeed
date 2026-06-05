import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const tiers = [
  {
    id: 'free',
    name: 'Free',
    price: '€0',
    cadence: '',
    blurb: 'Browse, message, and pledge. Tutors get a free site with 5% lesson fee + 300 classroom min/mo.',
    features: [
      'Full marketplace access',
      'Direct messaging with teachers',
      'Crowdfund and pledge projects',
      'Tutors: your own yourname.kotobaseed.net site',
      'Tutors: 5% platform fee on lessons + 300 min/mo',
    ],
    cta: { label: 'Already free', disabled: true },
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '€5',
    cadence: '/month',
    blurb: 'For active learners. Monthly priority credits + premium content access.',
    features: [
      'Everything in Free',
      'One Priority Credit per month (jump request queues)',
      'Access to premium projects + videos',
      'Plus badge on your profile',
    ],
    cta: { label: 'Get Plus', planId: 'plus' },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '€15',
    cadence: '/month',
    blurb: 'For teachers + individual tutors. Verifications, analytics, and (if you tutor) zero lesson fees.',
    features: [
      'Everything in Plus',
      'Language verification submission',
      'Advanced project + lesson analytics',
      'Pro badge on your profile',
      'Tutors: 0% lesson fee (was 5%)',
      'Tutors: 1000 classroom min/mo',
      'Tutors: custom domain + landing-page builder',
    ],
    cta: { label: 'Get Pro', planId: 'pro' },
    highlight: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: '€49',
    cadence: '/month',
    blurb: 'For language schools and full-time pros. Everything in Pro plus seats, support, and no Kotobaseed branding.',
    features: [
      'Everything in Pro',
      'Up to 5 Tutor accounts under one billing',
      'Unlimited classroom minutes (fair use)',
      'No "Powered by Kotobaseed" footer on your sites',
      'Priority email support (24h SLA)',
    ],
    cta: { label: 'Get Business', planId: 'business' },
  },
];

const MARKETPLACE_FEE_NOTE =
  'Marketplace sales (crowdfunded projects + tips) have a separate 15% platform fee regardless of your subscription. It covers payments, discovery, and the 14-day refund window.';

const PricingPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);

  const handleChoose = async (planId) => {
    if (!planId) return;
    if (!token) {
      navigate('/register');
      return;
    }
    setPending(planId);
    try {
      const res = await client.post('/subscriptions/create-checkout-session', {
        plan_id: planId,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setPending(null);
      }
    } catch (err) {
      console.error('Could not start checkout', err);
      setPending(null);
    }
  };

  return (
    <div className="bg-kotoba-background">
      <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold text-kotoba-primary sm:text-5xl">
            Pricing that fits where you are.
          </h1>
          <p className="mt-4 text-lg text-kotoba-text">
            Start free — use the marketplace, message teachers, sign up as a tutor. Upgrade when the perks earn their keep. Cancel any time.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4 max-w-7xl mx-auto">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`bg-white rounded-2xl p-6 flex flex-col shadow-md ${
                tier.highlight ? 'ring-2 ring-kotoba-secondary' : 'ring-1 ring-kotoba-text/10'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-2xl font-bold text-kotoba-primary">{tier.name}</h2>
                {tier.highlight && (
                  <span className="text-xs font-semibold uppercase tracking-wide bg-kotoba-secondary text-kotoba-text px-2 py-1 rounded-full">
                    Most picked
                  </span>
                )}
              </div>
              <p className="mt-3">
                <span className="text-4xl font-extrabold text-kotoba-primary">{tier.price}</span>
                {tier.cadence && (
                  <span className="text-base font-medium text-kotoba-text/70">{tier.cadence}</span>
                )}
              </p>
              <p className="mt-3 text-kotoba-text text-sm">{tier.blurb}</p>

              <ul className="mt-5 space-y-2 text-sm text-kotoba-text flex-grow">
                {tier.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <svg
                      className="w-4 h-4 text-kotoba-primary mr-2 mt-1 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {tier.cta.disabled ? (
                <Link
                  to={token ? '/' : '/register'}
                  className="mt-6 w-full text-center font-semibold py-2.5 rounded-lg bg-white border-2 border-kotoba-primary text-kotoba-primary hover:bg-kotoba-primary hover:text-white transition-colors text-sm"
                >
                  {token ? 'You already have this' : 'Sign up'}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => handleChoose(tier.cta.planId)}
                  disabled={pending === tier.cta.planId}
                  className={`mt-6 w-full font-semibold py-2.5 rounded-lg transition-colors text-sm ${
                    tier.highlight
                      ? 'bg-kotoba-secondary text-kotoba-text hover:bg-kotoba-secondary-dark'
                      : 'bg-kotoba-primary text-white hover:bg-green-800'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {pending === tier.cta.planId ? 'Loading…' : tier.cta.label}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 max-w-3xl mx-auto bg-white/60 rounded-2xl p-8 text-kotoba-text">
          <h3 className="text-xl font-bold text-kotoba-primary mb-3">A note on the marketplace fee</h3>
          <p className="text-base leading-relaxed">{MARKETPLACE_FEE_NOTE}</p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
