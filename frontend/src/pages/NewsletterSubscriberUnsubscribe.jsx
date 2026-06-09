import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

// Unsubscribe landing for the direct-subscriber path (public CTA opt-in,
// not booker opt-in). Same shape as NewsletterUnsubscribe; different
// endpoint so the right row gets stamped.

const NewsletterSubscriberUnsubscribe = () => {
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
          `/newsletters/subscriber-unsubscribe?token=${encodeURIComponent(token)}`,
        );
        setState('done');
        setMessage(res.data?.message || "You're unsubscribed.");
      } catch (err) {
        setState('error');
        setMessage(
          getErrorMessage(
            err,
            'That unsubscribe link is invalid or has expired.',
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
            ? 'Unsubscribed'
            : state === 'error'
              ? 'Could not unsubscribe'
              : 'Working…'}
        </h1>
        <p className="text-kotoba-text">{message}</p>
      </div>
    </div>
  );
};

export default NewsletterSubscriberUnsubscribe;
