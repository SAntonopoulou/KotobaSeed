import React from 'react';
import { Link } from 'react-router-dom';

const tiers = [
  {
    name: 'Starter',
    id: 'starter',
    price: '€0',
    cadence: '/month',
    description: 'For tutors getting set up. Pay only when you teach.',
    features: [
      'Your own site at yourname.kotobaseed.net',
      'Bookings + built-in classroom video',
      'Up to 300 classroom minutes / month',
      '5% platform fee on each lesson you sell',
      'Optional listing in the marketplace (15% on those)',
    ],
    cta: 'Start free',
    href: '/onboarding/tutor',
    highlight: false,
  },
  {
    name: 'Pro',
    id: 'pro',
    price: '€35',
    cadence: '/month',
    description: 'For full-time tutors and small schools.',
    features: [
      'Everything in Starter',
      '0% platform fee on lessons you sell',
      '1,000 classroom minutes / month',
      'Custom domain (yourbusiness.com)',
      'Full landing-page builder + theme picker',
      'Optional marketplace listings (15% on those)',
    ],
    cta: 'Start free, switch to Pro any time',
    href: '/onboarding/tutor',
    highlight: true,
  },
];

const PricingPage = () => {
  return (
    <div className="bg-kotoba-background">
      <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold text-kotoba-primary sm:text-5xl">
            Honest pricing for tutors.
          </h1>
          <p className="mt-4 text-lg text-kotoba-text">
            Start on Starter — it's free until you earn. Switch to Pro when the lesson volume makes the maths flip in your favour. Both plans include the same tutoring tools; Pro just removes the per-lesson fee and unlocks customisation.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2 max-w-5xl mx-auto">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`bg-white rounded-2xl p-8 flex flex-col shadow-md ${
                tier.highlight ? 'ring-2 ring-kotoba-secondary' : 'ring-1 ring-kotoba-text/10'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-2xl font-bold text-kotoba-primary">{tier.name}</h2>
                {tier.highlight && (
                  <span className="text-xs font-semibold uppercase tracking-wide bg-kotoba-secondary text-kotoba-text px-3 py-1 rounded-full">
                    Most growth
                  </span>
                )}
              </div>
              <p className="mt-4">
                <span className="text-5xl font-extrabold text-kotoba-primary">{tier.price}</span>
                <span className="text-lg font-medium text-kotoba-text/70">{tier.cadence}</span>
              </p>
              <p className="mt-3 text-kotoba-text">{tier.description}</p>

              <ul className="mt-6 space-y-3 text-kotoba-text flex-grow">
                {tier.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <svg
                      className="w-5 h-5 text-kotoba-primary mr-3 mt-0.5 flex-shrink-0"
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

              <Link
                to={tier.href}
                className={`mt-8 w-full text-center font-semibold py-3 rounded-lg transition-colors ${
                  tier.highlight
                    ? 'bg-kotoba-secondary text-kotoba-text hover:bg-kotoba-secondary-dark'
                    : 'bg-kotoba-primary text-white hover:bg-green-800'
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-16 max-w-3xl mx-auto bg-white/60 rounded-2xl p-8 text-kotoba-text">
          <h3 className="text-xl font-bold text-kotoba-primary mb-3">A note on the marketplace</h3>
          <p className="text-base leading-relaxed">
            The Kotobaseed marketplace is a separate place where tutors crowdfund comprehensible-input videos and sell access to learners outside their own student list. Listing on the marketplace is always optional. When you sell through it, the platform fee is 15% (covering payments, discovery, and refund coverage), regardless of whether you're on Starter or Pro.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
