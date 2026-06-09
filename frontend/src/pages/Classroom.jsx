import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../api/client';
import { useTenant } from '../hooks/useTenant';
import { getErrorMessage } from '../utils/errors';

/**
 * Single page that works for both tutor and student joins.
 *
 * The two backend endpoints (tutor-side at /tutor/bookings/{id}/classroom-token
 * and student-side at /users/me/bookings/{id}/classroom-token) share the same
 * time-gating + Stripe-status policy. We try the one that matches the host
 * we're on first; if that fails with 403/404 (wrong half — e.g. a student
 * landed on a tutor subdomain), we fall back to the other. Terminal codes
 * (400/409/503) short-circuit so users see the real reason.
 */
const Classroom = () => {
  const { bookingId } = useParams();
  const tenant = useTenant();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');

    const tryEndpoints = tenant.kind === 'tutor'
      ? [
          `/tutor/bookings/${bookingId}/classroom-token`,
          `/users/me/bookings/${bookingId}/classroom-token`,
        ]
      : [
          `/users/me/bookings/${bookingId}/classroom-token`,
          `/tutor/bookings/${bookingId}/classroom-token`,
        ];

    (async () => {
      let lastErr = null;
      for (const url of tryEndpoints) {
        try {
          const res = await client.post(url);
          if (!cancelled) setData(res.data);
          return;
        } catch (err) {
          lastErr = err;
          const code = err?.response?.status;
          if (code && [400, 409, 503].includes(code)) {
            if (!cancelled) {
              setError(getErrorMessage(err, 'Cannot join the classroom right now.'));
            }
            return;
          }
        }
      }
      if (!cancelled) {
        setError(
          getErrorMessage(lastErr, 'Could not join — make sure you are logged in.')
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingId, tenant.kind]);

  if (error) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-kotoba-primary mb-2">Classroom unavailable</h1>
          <p className="text-kotoba-text mb-6">{error}</p>
          <Link
            to="/"
            className="inline-block px-6 py-2.5 rounded-lg bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center">
        <p className="text-kotoba-text">Connecting…</p>
      </div>
    );
  }

  // Daily's prebuilt UI accepts ?t=<token> on the room URL.
  const src = `${data.room_url}?t=${encodeURIComponent(data.token)}`;

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <iframe
        title="Classroom"
        src={src}
        allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
        className="flex-1 w-full border-0"
      />
    </div>
  );
};

export default Classroom;
