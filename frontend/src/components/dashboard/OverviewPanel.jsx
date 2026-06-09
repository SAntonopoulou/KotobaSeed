import React, { useCallback, useEffect, useState } from 'react';
import client from '../../api/client';
import TutorAnalytics from '../TutorAnalytics';
import NextLessonCard from './NextLessonCard';
import SectionHeader from './SectionHeader';

// Source of truth for tour completion is the same localStorage key
// TutorTour itself uses. Keep them aligned.
const TOUR_DONE_KEY = 'koto:tutor-tour-completed';

// Stripe Connect dashboard button with a visible loading state. Both
// the login-link and onboarding-link endpoints can take a couple of
// seconds — Stripe round-trips on top of our round-trip. Without a
// spinner the click feels broken. Spans both states (connected /
// not-connected) so the rest of the panel doesn't need to branch.
const StripeDashboardButton = ({ hasAccount }) => {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (hasAccount) {
        const res = await client.post('/users/stripe-login-link');
        if (res.data?.login_url) {
          window.open(res.data.login_url, '_blank', 'noopener,noreferrer');
        }
      } else {
        const res = await client.post('/users/stripe-onboarding-link');
        if (res.data?.onboarding_url) {
          window.location.href = res.data.onboarding_url;
          return;
        }
      }
    } catch (err) {
      alert(err?.response?.data?.detail ||
        (hasAccount
          ? 'Could not generate a login link to your Stripe dashboard.'
          : 'Could not start Stripe onboarding.'));
    } finally {
      setBusy(false);
    }
  };
  const cls = hasAccount
    ? 'inline-flex items-center gap-2 px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary hover:text-white transition-colors disabled:opacity-60 disabled:cursor-wait'
    : 'inline-flex items-center gap-2 px-4 py-2 rounded-md bg-kotoba-primary text-white font-medium hover:bg-kotoba-primary/90 disabled:opacity-60 disabled:cursor-wait';
  return (
    <button type="button" onClick={handleClick} disabled={busy} className={cls}>
      {busy && (
        <span
          className="inline-block w-4 h-4 rounded-full border-2 border-current border-r-transparent animate-spin"
          aria-hidden="true"
        />
      )}
      {busy
        ? hasAccount ? 'Opening your Stripe dashboard…' : 'Connecting to Stripe…'
        : hasAccount ? 'Open my Stripe dashboard' : 'Connect Stripe to receive payouts'}
    </button>
  );
};

// KYC status section — prominent amber banner when verification is
// still pending (so a tutor can't miss "you need to finish KYC before
// payouts work"), discreet white card once Stripe says they're good.
// Pulls a fresh AccountLink on click because Stripe's hosted onboarding
// URLs expire quickly; the stale URL from signup is no good once the
// user navigates back through the dashboard.
const KycStatusSection = ({ tutor, isPaused }) => {
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState('');

  const handleResume = async () => {
    setResuming(true);
    setResumeError('');
    try {
      const res = await client.post('/onboarding/tutor/refresh-link');
      const url = res.data?.onboarding_url;
      if (url) {
        window.location.href = url;
        return;
      }
      setResumeError('Stripe didn\'t return a link. Try refreshing the page.');
    } catch (err) {
      setResumeError(
        err?.response?.data?.detail
        || 'Could not start Stripe verification. Try again in a moment.',
      );
    } finally {
      setResuming(false);
    }
  };

  if (isPaused) {
    return (
      <section className="rounded-2xl p-6 bg-amber-50 border-2 border-amber-300">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider font-semibold text-amber-700">
              Action required
            </p>
            <h2 className="mt-1 text-xl font-bold text-amber-900">
              Finish Stripe identity verification
            </h2>
            <p className="mt-2 text-sm text-amber-900">
              Until you finish Stripe's identity check, your tutor site stays in draft mode and you can't accept bookings or receive payouts. It takes 5–10 minutes — Stripe asks for ID and bank details.
            </p>
            {resumeError && (
              <p className="mt-2 text-sm text-red-700" role="alert">{resumeError}</p>
            )}
            {tutor.stripe_connect_account_id && (
              <p className="mt-3 text-xs text-amber-900/60 font-mono">
                Stripe account: {tutor.stripe_connect_account_id}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleResume}
            disabled={resuming}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-60"
          >
            {resuming && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            )}
            {resuming ? 'Opening Stripe…' : 'Resume verification →'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl p-6 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Your site is live</h2>
          <p className="mt-1 text-sm text-kotoba-text">
            Bookings and payments are turned on.
          </p>
          {tutor.stripe_connect_account_id && (
            <p className="mt-2 text-xs text-kotoba-text/60 font-mono">
              Stripe account: {tutor.stripe_connect_account_id}
            </p>
          )}
        </div>
        <StripeDashboardButton hasAccount={Boolean(tutor.stripe_connect_account_id)} />
      </div>
    </section>
  );
};

const OverviewPanel = ({ tutor, onJumpTo }) => {
  const isPaused = tutor.account_status !== 'active';

  // Tour completion lives in localStorage — that's what TutorTour
  // itself writes when the last step's "Done" button is clicked or the
  // tour is skipped. We listen for changes via storage events + a
  // custom restart event so the banner flips immediately when the tour
  // is replayed without a page refresh.
  const readTourDone = () => {
    try { return localStorage.getItem(TOUR_DONE_KEY) === '1'; } catch { return false; }
  };
  const [tourDone, setTourDone] = useState(readTourDone);

  useEffect(() => {
    const refresh = () => setTourDone(readTourDone());
    window.addEventListener('storage', refresh);
    window.addEventListener('koto:tutor-tour-restart', refresh);
    // Poll once per second while the tour is running; cheap, and saves
    // us from threading a more elaborate event from TutorTour.
    const t = setInterval(refresh, 1000);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('koto:tutor-tour-restart', refresh);
      clearInterval(t);
    };
  }, []);

  const restartTour = useCallback(() => {
    try { localStorage.removeItem(TOUR_DONE_KEY); } catch { /* ignore */ }
    setTourDone(false);
    window.dispatchEvent(new CustomEvent('koto:tutor-tour-restart'));
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Welcome back, ${tutor.display_name.split(' ')[0]}.`}
        description="A snapshot of bookings, students, and revenue across your site."
      />

      <NextLessonCard />

      {!tourDone && (
        <section className="rounded-2xl p-6 bg-kotoba-secondary/15 border border-kotoba-secondary/40 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60">
              Quick tour · 10 steps · ~3 min
            </p>
            <h2 className="mt-1 text-lg font-bold text-kotoba-primary">
              New here? Start the dashboard tour.
            </h2>
            <p className="mt-1 text-sm text-kotoba-text/70">
              Soba will show you availability, pricing, classroom, content, and getting paid. You can skip any time.
            </p>
          </div>
          <button
            type="button"
            onClick={restartTour}
            className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
          >
            Start tour
          </button>
        </section>
      )}

      {tourDone && (
        <section className="rounded-2xl p-4 bg-white shadow-sm flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-kotoba-text/70">
            You finished the tour. Run it again any time for a refresher.
          </p>
          <button
            type="button"
            onClick={restartTour}
            className="text-sm font-medium text-kotoba-primary hover:underline"
          >
            Replay tour →
          </button>
        </section>
      )}

      <KycStatusSection tutor={tutor} isPaused={isPaused} />

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
