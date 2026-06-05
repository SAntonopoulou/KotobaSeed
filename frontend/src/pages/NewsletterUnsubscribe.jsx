import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';

// Public landing page for the unsubscribe link in newsletter emails.
// Hits the backend with the token from the URL; the backend verifies
// the signature and records the opt-out idempotently. Both success and
// "already unsubscribed" land here with a friendly confirmation.

const NewsletterUnsubscribe = () => {
  const [params] = useSearchParams();
  const [state, setState] = useState('working'); // 'working' | 'done' | 'error'
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
          `/newsletters/unsubscribe?token=${encodeURIComponent(token)}`
        );
        setState('done');
        setMessage(res.data?.message || "You're unsubscribed.");
      } catch (err) {
        setState('error');
        setMessage(
          err?.response?.data?.detail
          || 'That unsubscribe link is invalid or has expired.'
        );
      }
    })();
  }, [params]);

  return (
    <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md text-center">
        <h1 className="text-2xl font-bold text-kotoba-primary mb-3">
          {state === 'done' ? 'Unsubscribed' : state === 'error' ? 'Could not unsubscribe' : 'Working…'}
        </h1>
        <p className="text-kotoba-text">{message}</p>
        {state === 'done' && (
          <p className="mt-4 text-sm text-kotoba-text/60">
            You can still book lessons and receive booking confirmations + reminders. This only stops newsletter broadcasts.
          </p>
        )}
      </div>
    </div>
  );
};

export default NewsletterUnsubscribe;
