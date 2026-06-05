import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const minDatetimeLocal = () => {
  // 1 hour from now, formatted for <input type="datetime-local">
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const BookingDialog = ({ pack, tutorDisplayName, onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [when, setWhen] = useState(() => minDatetimeLocal());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Lock the scroll under the modal while it's open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    if (!token) {
      // Send them to register/login then back to the tutor's site.
      const next = encodeURIComponent(window.location.pathname);
      navigate(`/login?next=${next}`);
      return;
    }

    // Convert the datetime-local (local time) to an ISO string with timezone.
    const localDate = new Date(when);
    if (Number.isNaN(localDate.getTime())) {
      setError('Pick a valid date and time.');
      return;
    }
    if (localDate.getTime() <= Date.now()) {
      setError('Pick a time in the future.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await client.post(`/tutor/lesson-packs/${pack.id}/book`, {
        scheduled_at: localDate.toISOString(),
      });
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setError('Checkout did not return a URL. Try again.');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not start checkout.');
    } finally {
      setSubmitting(false);
    }
  };

  const total = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: (pack.currency || 'eur').toUpperCase(),
      }).format(pack.price_cents / 100);
    } catch {
      return `€${(pack.price_cents / 100).toFixed(2)}`;
    }
  }, [pack]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-kotoba-primary">{pack.name}</h2>
            <p className="text-sm text-kotoba-text/70 mt-1">
              {pack.num_lessons} × {pack.duration_minutes} min with {tutorDisplayName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-kotoba-text/50 hover:text-kotoba-text text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="when">
              When?
            </label>
            <input
              id="when"
              type="datetime-local"
              required
              min={minDatetimeLocal()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
            <p className="mt-1 text-xs text-kotoba-text/60">
              {pack.num_lessons > 1
                ? 'Pick the time for your first lesson. You\'ll schedule the rest later.'
                : 'Pick a time at least an hour from now.'}
            </p>
          </div>

          <div className="bg-kotoba-background/50 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm text-kotoba-text">Total</span>
            <span className="text-2xl font-extrabold text-kotoba-primary">{total}</span>
          </div>

          {!token && (
            <p className="text-xs text-kotoba-text/60">
              You'll be asked to sign in or create an account before paying.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
          >
            {submitting ? 'Loading…' : 'Continue to checkout'}
          </button>
          <p className="text-xs text-center text-kotoba-text/60">
            Card details handled by Stripe. You can cancel any time before the lesson.
          </p>
        </form>
      </div>
    </div>
  );
};

export default BookingDialog;
