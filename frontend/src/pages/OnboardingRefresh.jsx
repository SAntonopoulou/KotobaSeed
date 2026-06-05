import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Stripe redirects here when an AccountLink expires mid-onboarding. We
// immediately mint a fresh link and bounce the user back to Stripe so
// they don't see this page for more than a moment.
const OnboardingRefresh = () => {
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.post('/onboarding/tutor/refresh-link');
        if (!cancelled && res.data?.onboarding_url) {
          window.location.href = res.data.onboarding_url;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || 'Could not refresh onboarding link.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-kotoba-background min-h-screen py-16">
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-md p-8 text-center">
          {error ? (
            <>
              <h1 className="text-2xl font-bold text-kotoba-primary">Something went wrong</h1>
              <p className="mt-3 text-kotoba-text">{error}</p>
            </>
          ) : (
            <p className="text-kotoba-text">Refreshing your Stripe link…</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingRefresh;
