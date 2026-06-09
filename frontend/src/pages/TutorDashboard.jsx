import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

import LessonPackManager from '../components/LessonPackManager';
import BookingsManager from '../components/BookingsManager';
import AvailabilityEditor from '../components/AvailabilityEditor';
import DemoClassroomCard from '../components/DemoClassroomCard';
import TrialSettings from '../components/TrialSettings';
import SingleLessonQuickSet from '../components/SingleLessonQuickSet';
import CustomDomainSettings from '../components/CustomDomainSettings';
import MarketplaceListingToggle from '../components/MarketplaceListingToggle';
import KotobaseedCrossLinkToggle from '../components/KotobaseedCrossLinkToggle';
import CancellationPolicy from '../components/CancellationPolicy';
import BookingLeadTimePolicy from '../components/BookingLeadTimePolicy';
import ArticlesManager from '../components/ArticlesManager';
import TestimonialsManager from '../components/TestimonialsManager';
import EmailTemplatesManager from '../components/EmailTemplatesManager';
import TutorAccountSettings from '../components/TutorAccountSettings';
import NewslettersManager from '../components/NewslettersManager';
import HomeworkTemplatesManager from '../components/HomeworkTemplatesManager';
import HomeworkAssignmentsManager from '../components/HomeworkAssignmentsManager';
import PlacementTestManager from '../components/PlacementTestManager';
import ModulesManager from '../components/ModulesManager';
import CohortsManager from '../components/CohortsManager';
import SubscriptionPlanManager from '../components/SubscriptionPlanManager';
import MinuteUsageCard from '../components/MinuteUsageCard';
import TutorVerificationsManager from '../components/TutorVerificationsManager';
import TeamPanel from '../components/TeamPanel';
import CustomThemeCard from '../components/CustomThemeCard';
import CustomThemeV2Picker from '../components/dashboard/CustomThemeV2Picker';
import MyStudentsManager from '../components/MyStudentsManager';
import PageBuilder from '../components/PageBuilder';
import ThemePicker from '../components/ThemePicker';
import GradingQueue from '../components/GradingQueue';
import GroupClassesPanel from '../components/GroupClassesPanel';
import { apexUrl } from '../hooks/useTenant';

import DashboardSidebar, { SECTION_KEYS } from '../components/dashboard/DashboardSidebar';
import SectionHeader from '../components/dashboard/SectionHeader';
import TutorTour from '../components/tutor-tour/TutorTour';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import ResumeOnboardingBanner from '../components/ResumeOnboardingBanner';
import OverviewPanel from '../components/dashboard/OverviewPanel';
import ProfileEditor from '../components/dashboard/ProfileEditor';
import { getErrorMessage } from '../utils/errors';

const STRIPE_EXPRESS_DASHBOARD = 'https://dashboard.stripe.com/express';

// Strip a token from #token=... if present (post-Stripe redirect). Done
// synchronously on first render so a freshly-onboarded tutor doesn't bounce
// to /login before we can claim the token.
const claimTokenFromHash = (login) => {
  if (typeof window === 'undefined' || !window.location.hash) return false;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('token');
  if (!token) return false;
  login(token);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
};

// Section is selected via #section URL fragment so deep-links work and a
// refresh stays on the same page. Falls back to overview.
const readSectionFromHash = () => {
  if (typeof window === 'undefined') return 'overview';
  const raw = window.location.hash.replace('#', '').split('?')[0];
  return SECTION_KEYS.includes(raw) ? raw : 'overview';
};

// Stripe Connect action button — handles both states with a clear loading
// indicator. Onboarding and login-link both hit the network (and Stripe
// adds a round-trip on top), so without a spinner the user thinks the
// button is broken. A short delay is normal; this keeps the action
// obviously in flight.
const StripeConnectButton = ({ hasAccount, addToast }) => {
  const [busy, setBusy] = React.useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (hasAccount) {
        const res = await client.post('/users/stripe-login-link');
        if (res.data?.login_url) {
          window.open(res.data.login_url, '_blank', 'noopener,noreferrer');
        } else {
          addToast?.('Stripe did not return a dashboard URL.', 'error');
        }
      } else {
        const res = await client.post('/users/stripe-onboarding-link');
        if (res.data?.onboarding_url) {
          window.location.href = res.data.onboarding_url;
          return; // navigation in flight — leave busy=true so the button stays disabled
        }
        addToast?.('Stripe did not return an onboarding URL.', 'error');
      }
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        (hasAccount
          ? 'Could not generate a login link to your Stripe dashboard.'
          : 'Could not start Stripe onboarding.');
      addToast?.(detail, 'error');
    } finally {
      setBusy(false);
    }
  };

  const baseClass = hasAccount
    ? 'inline-flex items-center gap-2 px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary hover:text-white transition-colors disabled:opacity-60 disabled:cursor-wait'
    : 'inline-flex items-center gap-2 px-4 py-2 rounded-md bg-kotoba-primary text-white font-medium hover:bg-kotoba-primary/90 disabled:opacity-60 disabled:cursor-wait';

  return (
    <button type="button" onClick={handleClick} disabled={busy} className={baseClass}>
      {busy && (
        <span
          className="inline-block w-4 h-4 rounded-full border-2 border-current border-r-transparent animate-spin"
          aria-hidden="true"
        />
      )}
      {busy
        ? hasAccount
          ? 'Opening your Stripe dashboard…'
          : 'Connecting to Stripe…'
        : hasAccount
          ? 'Open my Stripe dashboard'
          : 'Connect Stripe to receive payouts'}
    </button>
  );
};

const TutorDashboard = () => {
  const navigate = useNavigate();
  const { login, logout, currentUser, loading } = useAuth();
  const { addToast } = useToast();
  const [tutor, setTutor] = useState(null);
  const [section, setSection] = useState(readSectionFromHash);
  const [error, setError] = useState('');

  useMemo(() => {
    claimTokenFromHash(login);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Wait for the AuthContext probe to finish — without this, a tutor
    // arriving from the apex via the shared SSO cookie would briefly see
    // currentUser=null and get bounced to /login before /users/me lands.
    if (loading) return undefined;
    if (!currentUser) {
      navigate('/login');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/tutor/me');
        if (!cancelled) {
          setTutor(res.data);
        }
      } catch (err) {
        if (!cancelled) {
          if (err?.response?.status === 401) {
            navigate('/login');
            return;
          }
          // 403 falls through to the ownership-mismatch guard further
          // down — don't bounce on it.
          setError(getErrorMessage(err, 'Could not load your tutor profile.'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, currentUser, navigate]);

  // Sync section selection to the URL hash for refresh-stable deep links.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash.replace('#', '') !== section) {
      history.replaceState(null, '', `${window.location.pathname}#${section}`);
    }
  }, [section]);

  // Listen for external hash changes (e.g. the onboarding tour drives
  // `window.location.hash` to switch sections) so state stays in sync
  // with the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onHashChange = () => {
      const next = readSectionFromHash();
      setSection((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (error && !tutor) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl shadow-soft p-8 max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-kotoba-primary mb-2">Couldn't load</h1>
          <p className="text-kotoba-text">{error}</p>
        </div>
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center">
        <p className="text-kotoba-text">Loading…</p>
      </div>
    );
  }

  // Ownership guard. /tutor/me is a public read, so the dashboard can load
  // for anyone — but every owner-only endpoint behind it (bookings,
  // onboarding/progress, profile patches…) will 403. Catch that here and
  // offer an in-place sign-in with the right account, no logout dance.
  if (currentUser && tutor.user_id !== currentUser.id) {
    const goSignInAsOwner = () => {
      // Drop the stale token from this subdomain's localStorage and send
      // them to /login on the same subdomain so they can authenticate as
      // the owner without bouncing back to the apex.
      logout();
      navigate('/login', { state: { next: window.location.pathname } });
    };
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl shadow-soft p-8 max-w-md text-center space-y-4">
          <h1 className="font-display text-2xl font-bold text-kotoba-primary">Wrong account</h1>
          <p className="text-kotoba-text">
            You're signed in as <span className="font-medium">{currentUser.email}</span>,
            but this dashboard belongs to{' '}
            <span className="font-medium">{tutor.tutor_slug}.kotobaseed.net</span>.
          </p>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={goSignInAsOwner}
              className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
            >
              Sign in with the right account
            </button>
            <a
              href="/"
              className="px-5 py-2 rounded-md border border-kotoba-text/20 text-kotoba-text font-semibold hover:bg-kotoba-background/60"
            >
              View public site
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans bg-kotoba-background min-h-screen lg:flex">
      <TutorTour />
      <DashboardSidebar
        tutor={tutor}
        currentSection={section}
        onSelect={setSection}
        onLogout={handleLogout}
      />

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-8 space-y-6 max-w-5xl mx-auto w-full">
        <EmailVerificationBanner />
        <div className="flex justify-end -mt-2">
          <button
            type="button"
            onClick={() => {
              try { localStorage.removeItem('koto:tutor-tour-completed'); } catch { /* ignore */ }
              window.dispatchEvent(new CustomEvent('koto:tutor-tour-restart'));
            }}
            className="text-xs font-semibold text-kotoba-primary hover:underline px-2 py-1"
            title="Replay the guided dashboard tour"
          >
            Restart tour
          </button>
        </div>
        {section === 'overview' && (
          <OverviewPanel tutor={tutor} onJumpTo={setSection} />
        )}

        {section === 'bookings' && (
          <>
            <SectionHeader
              title="Bookings"
              description="Upcoming, completed, and cancelled lessons across all students."
            />
            <MinuteUsageCard />
            <BookingsManager />
          </>
        )}

        {section === 'lessons' && (
          <>
            <SectionHeader
              title="Lessons"
              description="Availability, pricing, free trial, and cancellation rules. This is what students see when they go to book."
            />
            <div data-tour="tutor-availability">
              <AvailabilityEditor />
            </div>
            <div data-tour="tutor-demo-classroom">
              <DemoClassroomCard />
            </div>
            <div data-tour="tutor-pricing" className="space-y-6">
              <SingleLessonQuickSet />
              <LessonPackManager />
              <GroupClassesPanel />
              <TrialSettings />
            </div>
            <BookingLeadTimePolicy />
            <CancellationPolicy />
          </>
        )}

        {section === 'content' && (
          <>
            <SectionHeader
              title="Content"
              description="Articles, modules, and your monthly subscription. Build the library that brings students to you."
            />
            <div data-tour="tutor-content" className="space-y-6">
              <ArticlesManager />
              <ModulesManager />
              <CohortsManager />
              <SubscriptionPlanManager />
              <NewslettersManager />
            </div>
          </>
        )}

        {section === 'students' && (
          <>
            <SectionHeader
              title="Students"
              description="Roster, homework, placement test, and the testimonials students leave you."
            />
            <MyStudentsManager />
            <GradingQueue />
            <PlacementTestManager />
            <HomeworkTemplatesManager />
            <HomeworkAssignmentsManager />
            <TestimonialsManager />
          </>
        )}

        {section === 'site' && (
          <>
            <SectionHeader
              title="Your site"
              description="Your public profile, page layout, custom domain, and marketplace listing."
            />
            <div data-tour="tutor-site" className="space-y-6">
              <ProfileEditor tutor={tutor} onSaved={setTutor} />
              <ThemePicker tutor={tutor} onSaved={setTutor} />
              <PageBuilder />
              <TutorVerificationsManager />
              <TeamPanel />
              <CustomThemeCard />
              <CustomThemeV2Picker />
              <CustomDomainSettings />
              <MarketplaceListingToggle />
              <KotobaseedCrossLinkToggle />
            </div>
          </>
        )}

        {section === 'money' && (
          <>
            <SectionHeader
              title="Money"
              description="Payouts and Stripe verification. Kotobaseed never holds your money — it goes straight to your bank."
            />
            <section data-tour="tutor-money" className="bg-white rounded-3xl shadow-soft p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold text-kotoba-primary">
                    {tutor.account_status === 'active'
                      ? 'Payouts are live'
                      : 'Stripe verification pending'}
                  </h2>
                  <p className="mt-1 text-sm text-kotoba-text">
                    {tutor.account_status === 'active'
                      ? 'Stripe sends payouts to your bank on its standard schedule. Manage payout cadence + bank details from the Stripe dashboard.'
                      : 'Finish Stripe identity verification to start taking bookings. Your site stays online; payments stay paused until verification is complete.'}
                  </p>
                  {tutor.stripe_connect_account_id && (
                    <p className="mt-2 text-xs text-kotoba-text/60 font-mono">
                      Stripe account: {tutor.stripe_connect_account_id}
                    </p>
                  )}
                </div>
                <StripeConnectButton
                  hasAccount={Boolean(tutor.stripe_connect_account_id)}
                  addToast={addToast}
                />
              </div>
            </section>

            {(() => {
              const tier = currentUser?.subscription_tier || 'free';
              const tierLabel =
                tier === 'free' || tier === 'none'
                  ? 'Free'
                  : tier.charAt(0).toUpperCase() + tier.slice(1);
              const onPaidTier = tier !== 'free' && tier !== 'none';
              const expiresAt = currentUser?.subscription_expires_at;
              return (
                <section className="bg-white rounded-3xl shadow-soft p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold text-kotoba-primary">Your plan</h2>
                      <p className="mt-1 text-sm text-kotoba-text">
                        You're currently on the{' '}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ml-1 ${
                          tier === 'business'
                            ? 'bg-purple-100 text-purple-800'
                            : tier === 'pro'
                            ? 'bg-amber-100 text-amber-800'
                            : tier === 'plus'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {tierLabel}
                        </span>
                        {' '}plan.
                        {onPaidTier && expiresAt && (
                          <> Renews on <span className="font-medium">{new Date(expiresAt).toLocaleDateString()}</span>.</>
                        )}
                      </p>
                      <p className="mt-2 text-sm text-kotoba-text/70">
                        {tier === 'business'
                          ? 'Business unlocks everything: themes, page builder, custom domain, 0% lesson fees, team seats, and the highest classroom-minute quota.'
                          : tier === 'pro'
                          ? 'Pro unlocks custom themes, the page builder, custom domain, 0% lesson fees, and a high classroom-minute quota. Upgrade to Business for team seats.'
                          : tier === 'plus'
                          ? 'Plus removes most platform limits. Upgrade to Pro or Business for custom themes, page builder, custom domain, 0% lesson fees, and team features.'
                          : 'Upgrade to Plus, Pro, or Business to unlock themes, the page builder, custom domain, 0% lesson fees, and a higher classroom-minute quota.'}
                      </p>
                    </div>
                    <a
                      href={apexUrl('/pricing')}
                      className="inline-flex items-center px-4 py-2 rounded-md bg-kotoba-primary text-white font-medium hover:bg-kotoba-primary/90"
                    >
                      {onPaidTier ? 'Manage plan' : 'View plans'}
                    </a>
                  </div>
                </section>
              );
            })()}
          </>
        )}

        {section === 'settings' && (
          <>
            <SectionHeader
              title="Settings"
              description="Your account, timezone, transactional emails, data export, and account deletion."
            />
            <div data-tour="tutor-settings" className="space-y-6">
              <TutorAccountSettings />
              <EmailTemplatesManager />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default TutorDashboard;
