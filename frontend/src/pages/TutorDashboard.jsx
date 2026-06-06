import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

import LessonPackManager from '../components/LessonPackManager';
import BookingsManager from '../components/BookingsManager';
import AvailabilityEditor from '../components/AvailabilityEditor';
import TrialSettings from '../components/TrialSettings';
import SingleLessonQuickSet from '../components/SingleLessonQuickSet';
import CustomDomainSettings from '../components/CustomDomainSettings';
import MarketplaceListingToggle from '../components/MarketplaceListingToggle';
import CancellationPolicy from '../components/CancellationPolicy';
import ArticlesManager from '../components/ArticlesManager';
import TestimonialsManager from '../components/TestimonialsManager';
import EmailTemplatesManager from '../components/EmailTemplatesManager';
import NewslettersManager from '../components/NewslettersManager';
import HomeworkTemplatesManager from '../components/HomeworkTemplatesManager';
import HomeworkAssignmentsManager from '../components/HomeworkAssignmentsManager';
import PlacementTestManager from '../components/PlacementTestManager';
import ModulesManager from '../components/ModulesManager';
import SubscriptionPlanManager from '../components/SubscriptionPlanManager';
import PageBuilder from '../components/PageBuilder';
import ThemePicker from '../components/ThemePicker';
import GradingQueue from '../components/GradingQueue';
import GroupClassesPanel from '../components/GroupClassesPanel';
import { apexUrl } from '../hooks/useTenant';

import DashboardSidebar, { SECTION_KEYS } from '../components/dashboard/DashboardSidebar';
import SectionHeader from '../components/dashboard/SectionHeader';
import OverviewPanel from '../components/dashboard/OverviewPanel';
import ProfileEditor from '../components/dashboard/ProfileEditor';

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

const TutorDashboard = () => {
  const navigate = useNavigate();
  const { token, login, logout } = useAuth();
  const [tutor, setTutor] = useState(null);
  const [section, setSection] = useState(readSectionFromHash);
  const [error, setError] = useState('');
  const [tokenClaimed, setTokenClaimed] = useState(false);

  useMemo(() => {
    const claimed = claimTokenFromHash(login);
    if (claimed) setTokenClaimed(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token && !tokenClaimed) {
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
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            navigate('/login');
            return;
          }
          setError(err?.response?.data?.detail || 'Could not load your tutor profile.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tokenClaimed, navigate]);

  // Sync section selection to the URL hash for refresh-stable deep links.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash.replace('#', '') !== section) {
      history.replaceState(null, '', `${window.location.pathname}#${section}`);
    }
  }, [section]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (error && !tutor) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-kotoba-primary mb-2">Couldn't load</h1>
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

  return (
    <div className="bg-kotoba-background min-h-screen lg:flex">
      <DashboardSidebar
        tutor={tutor}
        currentSection={section}
        onSelect={setSection}
        onLogout={handleLogout}
      />

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-8 space-y-6 max-w-5xl mx-auto w-full">
        {section === 'overview' && (
          <OverviewPanel tutor={tutor} onJumpTo={setSection} />
        )}

        {section === 'bookings' && (
          <>
            <SectionHeader
              title="Bookings"
              description="Upcoming, completed, and cancelled lessons across all students."
            />
            <BookingsManager />
          </>
        )}

        {section === 'lessons' && (
          <>
            <SectionHeader
              title="Lessons"
              description="Availability, pricing, free trial, and cancellation rules. This is what students see when they go to book."
            />
            <AvailabilityEditor />
            <SingleLessonQuickSet />
            <LessonPackManager />
            <GroupClassesPanel />
            <TrialSettings />
            <CancellationPolicy />
          </>
        )}

        {section === 'content' && (
          <>
            <SectionHeader
              title="Content"
              description="Articles, modules, and your monthly subscription. Build the library that brings students to you."
            />
            <ArticlesManager />
            <ModulesManager />
            <SubscriptionPlanManager />
            <NewslettersManager />
          </>
        )}

        {section === 'students' && (
          <>
            <SectionHeader
              title="Students"
              description="Homework, placement test, and the testimonials students leave you."
            />
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
            <ProfileEditor tutor={tutor} onSaved={setTutor} />
            <ThemePicker tutor={tutor} onSaved={setTutor} />
            <PageBuilder />
            <CustomDomainSettings />
            <MarketplaceListingToggle />
          </>
        )}

        {section === 'money' && (
          <>
            <SectionHeader
              title="Money"
              description="Payouts and Stripe verification. Kotobaseed never holds your money — it goes straight to your bank."
            />
            <section className="bg-white rounded-2xl shadow-sm p-6">
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

            <section className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold text-kotoba-primary">Your plan</h2>
                  <p className="mt-1 text-sm text-kotoba-text">
                    Upgrade to <strong>Pro</strong> or <strong>Business</strong> to unlock themes, the page builder, custom domain, 0% lesson fees, and a higher classroom-minute quota. Subscriptions are managed through Kotobaseed.
                  </p>
                </div>
                <a
                  href={apexUrl('/pricing')}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-kotoba-primary text-white font-medium hover:bg-kotoba-primary/90"
                >
                  View plans
                </a>
              </div>
            </section>
          </>
        )}

        {section === 'settings' && (
          <>
            <SectionHeader
              title="Settings"
              description="Transactional emails students receive from your site."
            />
            <EmailTemplatesManager />
          </>
        )}
      </main>
    </div>
  );
};

export default TutorDashboard;
