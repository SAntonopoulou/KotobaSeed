import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

// Click target for the public-CTA double-opt-in confirmation email.
// The token is HMAC-signed; the backend cross-checks the hash + TTL,
// stamps confirmed_at, and the subscriber joins the broadcast pool.

const NewsletterConfirmSubscription = () => {
  const [params] = useSearchParams();
  const [state, setState] = useState('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage('That link is missing a token.');
      return;
    }
    (async () => {
      try {
        const res = await client.get(
          `/newsletters/confirm?token=${encodeURIComponent(token)}`,
        );
        setState('done');
        setMessage(res.data?.message || 'Your subscription is confirmed.');
      } catch (err) {
        setState('error');
        setMessage(
          getErrorMessage(
            err,
            'That confirmation link is invalid or has expired. Try subscribing again.',
          ),
        );
      }
    })();
  }, [params]);

  return (
    <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md text-center">
        <h1 className="text-2xl font-bold text-kotoba-primary mb-3">
          {state === 'done'
            ? 'Subscription confirmed'
            : state === 'error'
              ? "Couldn't confirm"
              : 'Confirming…'}
        </h1>
        <p className="text-kotoba-text">{message}</p>
        {state === 'done' && (
          <p className="mt-4 text-sm text-kotoba-text/60">
            You'll get the tutor's newsletter going forward. You can unsubscribe in one click from any email.
          </p>
        )}
      </div>
    </div>
  );
};

export default NewsletterConfirmSubscription;
