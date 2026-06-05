import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { tutorSiteUrl } from '../hooks/useTenant';
import { useAuth } from '../context/AuthContext';

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
          setError(err?.response?.data?.detail || 'Could not load your onboarding status.');
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
      setError(err?.response?.data?.detail || 'Could not resume onboarding.');
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-kotoba-background min-h-screen py-16">
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
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
                Stripe hasn't finished verifying you yet. Resume the onboarding to finish — your slug is reserved so nobody else can take it.
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
