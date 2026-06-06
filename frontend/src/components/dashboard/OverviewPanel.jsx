import React from 'react';
import TutorAnalytics from '../TutorAnalytics';
import SectionHeader from './SectionHeader';

const STRIPE_EXPRESS_DASHBOARD = 'https://dashboard.stripe.com/express';

const OverviewPanel = ({ tutor, onJumpTo }) => {
  const isPaused = tutor.account_status !== 'active';

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Welcome back, ${tutor.display_name.split(' ')[0]}.`}
        description="A snapshot of bookings, students, and revenue across your site."
      />

      <section
        className={`rounded-2xl p-6 ${
          isPaused ? 'bg-kotoba-secondary/20' : 'bg-white shadow-sm'
        }`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-kotoba-primary">
              {isPaused ? 'Stripe verification pending' : 'Your site is live'}
            </h2>
            <p className="mt-1 text-sm text-kotoba-text">
              {isPaused
                ? 'Finish Stripe identity verification to start taking bookings.'
                : 'Bookings and payments are turned on.'}
            </p>
            {tutor.stripe_connect_account_id && (
              <p className="mt-2 text-xs text-kotoba-text/60 font-mono">
                Stripe account: {tutor.stripe_connect_account_id}
              </p>
            )}
          </div>
          <a
            href={STRIPE_EXPRESS_DASHBOARD}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary hover:text-white transition-colors"
          >
            Open Stripe dashboard
          </a>
        </div>
      </section>

      <TutorAnalytics />

      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-3">Quick actions</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onJumpTo('bookings')}
            className="text-left p-4 rounded-lg border border-kotoba-text/10 hover:border-kotoba-primary hover:bg-kotoba-primary/5"
          >
            <p className="font-semibold text-kotoba-primary">Manage bookings</p>
            <p className="text-xs text-kotoba-text/60 mt-1">
              Upcoming lessons, completions, and cancellations.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onJumpTo('lessons')}
            className="text-left p-4 rounded-lg border border-kotoba-text/10 hover:border-kotoba-primary hover:bg-kotoba-primary/5"
          >
            <p className="font-semibold text-kotoba-primary">Edit availability</p>
            <p className="text-xs text-kotoba-text/60 mt-1">
              Set the hours students can book you for.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onJumpTo('content')}
            className="text-left p-4 rounded-lg border border-kotoba-text/10 hover:border-kotoba-primary hover:bg-kotoba-primary/5"
          >
            <p className="font-semibold text-kotoba-primary">Publish content</p>
            <p className="text-xs text-kotoba-text/60 mt-1">
              Articles, modules, newsletters.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onJumpTo('site')}
            className="text-left p-4 rounded-lg border border-kotoba-text/10 hover:border-kotoba-primary hover:bg-kotoba-primary/5"
          >
            <p className="font-semibold text-kotoba-primary">Customise your site</p>
            <p className="text-xs text-kotoba-text/60 mt-1">
              Profile, page builder, themes, domain.
            </p>
          </button>
        </div>
      </section>
    </div>
  );
};

export default OverviewPanel;
