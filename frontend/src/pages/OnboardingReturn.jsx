import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { tutorSiteUrl } from '../hooks/useTenant';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';

const OnboardingReturn = () => {
  const { token } = useAuth();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/onboarding/tutor/status');
        if (!cancelled) setStatus(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Could not load your onboarding status.'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleResume = async () => {
    setRefreshing(true);
    try {
      const res = await client.post('/onboarding/tutor/refresh-link');
      if (res.data?.onboarding_url) {
        window.location.href = res.data.onboarding_url;
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not resume onboarding.'));
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-kotoba-background min-h-screen py-16">
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <EmailVerificationBanner />
        <div className="bg-white rounded-2xl shadow-md p-8 text-center">
          {error && (
            <p className="text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-md">{error}</p>
          )}

          {!status && !error && (
            <p className="text-kotoba-text">Checking with Stripe…</p>
          )}

          {status?.onboarding_complete && (() => {
            const siteUrl = tutorSiteUrl(status.tutor_slug, '/');
            const dashboardUrl = tutorSiteUrl(
              status.tutor_slug,
              '/dashboard',
              token ? `token=${token}` : ''
            );
            const payoutsPending = status.charges_enabled && !status.payouts_enabled;
            return (
              <>
                <h1 className="text-3xl font-extrabold text-kotoba-primary">You're set up.</h1>
                <p className="mt-3 text-kotoba-text">
                  Your tutor site is live at{' '}
                  <a href={siteUrl} className="text-kotoba-primary font-medium underline">
                    {siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                  . Welcome to Kotobaseed.
                </p>
                {payoutsPending && (
                  <div className="mt-5 text-left text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-md px-4 py-3">
                    <p className="font-semibold">Heads up — payouts are still being approved.</p>
                    <p className="mt-1">
                      You can already accept bookings now. Stripe is finishing a
                      final review of your payout details (usually within a day).
                      Your earnings sit safely in Stripe and release to your bank
                      automatically as soon as it's done — nothing else you need
                      to do on your side.
                    </p>
                  </div>
                )}
                <a
                  href={dashboardUrl}
                  className="mt-8 inline-block px-6 py-3 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
                >
                  Go to your dashboard
                </a>
              </>
            );
          })()}

          {status && !status.onboarding_complete && (
            <>
              <h1 className="text-3xl font-extrabold text-kotoba-primary">One more step.</h1>
              <p className="mt-3 text-kotoba-text">
                Stripe still needs some information from you before you can take bookings.
                Resume the onboarding to finish — your slug is reserved so nobody else can take it.
              </p>
              <button
                onClick={handleResume}
                disabled={refreshing}
                className="mt-8 px-6 py-3 rounded-lg bg-kotoba-primary text-white font-semibold hover:bg-green-800 disabled:opacity-60"
              >
                {refreshing ? 'Loading…' : 'Resume Stripe onboarding'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingReturn;
