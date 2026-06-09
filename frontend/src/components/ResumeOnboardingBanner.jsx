import React, { useState } from 'react';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

/**
 * Prominent dashboard banner that surfaces when a tutor's Stripe Connect
 * KYC is still pending (`account_status === 'paused_kyc'`).
 *
 * Without this, a tutor who closed their tab mid-KYC has no in-app way to
 * resume — they'd have to remember to navigate to /onboarding/return on
 * the apex. The banner calls POST /onboarding/tutor/refresh-link to mint
 * a fresh Stripe-hosted AccountLink and bounces them straight to it.
 */
const ResumeOnboardingBanner = ({ tutor }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!tutor || tutor.account_status !== 'paused_kyc') return null;

  const handleResume = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await client.post('/onboarding/tutor/refresh-link');
      if (res.data?.onboarding_url) {
        window.location.href = res.data.onboarding_url;
      } else {
        setError('Stripe did not return an onboarding link. Try again.');
        setLoading(false);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not resume onboarding.'));
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 text-amber-900 px-5 py-4">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 mt-0.5 shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">Finish your Stripe onboarding to accept bookings.</p>
          <p className="mt-1 text-sm">
            Your tutor site is live, but you can't take payments yet. Stripe
            needs a few more details (identity, bank, payout info). It usually
            takes 5–10 minutes and you can come back to it anytime.
          </p>
          {error && (
            <p className="mt-2 text-sm font-medium text-red-700">{error}</p>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={handleResume}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60"
            >
              {loading ? 'Opening Stripe…' : 'Resume Stripe onboarding'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResumeOnboardingBanner;
