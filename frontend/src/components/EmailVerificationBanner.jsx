import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';

/**
 * Amber "verify your email" callout. Renders nothing if the current user
 * is already verified (or not signed in).
 *
 * We surface it in two spots where it matters most:
 *   - The /onboarding/return page right after Stripe KYC, because Stripe's
 *     redirect bypasses our verification flow entirely.
 *   - The top of the tutor dashboard, so a tutor who skipped the prompt
 *     on the return page still gets reminded every time they log in.
 *
 * Includes an inline resend button so the tutor doesn't have to navigate
 * away if their code got lost — and a "Enter code" CTA that takes them to
 * the full verification page.
 */
const EmailVerificationBanner = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [resending, setResending] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  if (!currentUser || currentUser.email_verified_at) return null;

  const handleResend = async () => {
    setResending(true);
    setError('');
    setInfo('');
    try {
      await client.post('/auth/resend-verification');
      setInfo('Sent a fresh code to your email.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not resend the code.'));
    } finally {
      setResending(false);
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
          <p className="font-semibold">Verify your email to finish setting up.</p>
          <p className="mt-1 text-sm">
            We sent a 6-digit code to{' '}
            <span className="font-medium">{currentUser.email}</span>. You need to
            verify before you can receive booking notifications, password
            recovery, and payout emails.
          </p>
          {info && (
            <p className="mt-2 text-sm font-medium text-green-800">{info}</p>
          )}
          {error && (
            <p className="mt-2 text-sm font-medium text-red-700">{error}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/verify-email')}
              className="px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
            >
              Enter my code
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="px-4 py-2 rounded-md border border-amber-600 text-amber-900 text-sm font-semibold hover:bg-amber-100 disabled:opacity-60"
            >
              {resending ? 'Sending…' : 'Resend the code'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationBanner;
