import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const BookingDialog = ({ pack, tutorDisplayName, onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [pickedSlot, setPickedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [cutoffHours, setCutoffHours] = useState(48);
  const [acknowledgedCutoff, setAcknowledgedCutoff] = useState(false);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    setError('');
    (async () => {
      try {
        // Trial branch hits its own slot endpoint — the backend filters to
        // windows with allow_trial=True so the student only ever sees
        // tutor-approved trial times.
        const path = pack.isTrial
          ? '/tutor/availability/trial-slots?days=21'
          : `/tutor/availability/slots?pack_id=${pack.id}&days=21`;
        const res = await client.get(path);
        if (!cancelled) setSlots(res.data || []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || 'Could not load times.');
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pack.id, pack.isTrial]);

  // Tutor's booking policy — drives the no-cancel warning when the
  // picked slot lands inside the cancellation cutoff. We fetch this in
  // parallel with the slots; failure falls back to the platform floor
  // (48h) so the warning still shows even if the policy fetch fails.
  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/tutor/policy');
        if (res.data?.cancellation_cutoff_hours) {
          setCutoffHours(res.data.cancellation_cutoff_hours);
        }
      } catch {
        // Falls back to default 48 — safer to warn even if we missed.
      }
    })();
  }, []);

  const groupedByDay = useMemo(() => {
    const groups = new Map();
    for (const slot of slots) {
      const d = new Date(slot.scheduled_at);
      const key = d.toDateString();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(slot);
    }
    return [...groups.entries()];
  }, [slots]);

  const handleConfirm = async () => {
    if (!pickedSlot) {
      setError('Pick a time to continue.');
      return;
    }
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      navigate(`/login?next=${next}`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (pack.isTrial) {
        // Trial: no Stripe, just create the CONFIRMED booking and bounce
        // the student to the success page.
        const res = await client.post('/tutor/trial/book', {
          scheduled_at: pickedSlot.scheduled_at,
        });
        const bookingId = res.data?.booking_id;
        window.location.href = `/booking/success?booking=${bookingId ?? ''}&trial=1`;
        return;
      }
      const res = await client.post(`/tutor/lesson-packs/${pack.id}/book`, {
        scheduled_at: pickedSlot.scheduled_at,
      });
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setError('Checkout did not return a URL. Try again.');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not book.');
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
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
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

        <div>
          <p className="text-sm font-medium text-kotoba-text mb-2">
            Pick a time {pack.num_lessons > 1 ? 'for your first lesson' : ''}
          </p>
          {loadingSlots ? (
            <p className="text-sm text-kotoba-text/70">Finding open times…</p>
          ) : groupedByDay.length === 0 ? (
            <div className="text-sm text-kotoba-text/70 bg-kotoba-background/50 rounded-md p-4">
              No open times in the next three weeks. The tutor may need to add availability — try again later or
              message them.
            </div>
          ) : (
            <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
              {groupedByDay.map(([dayKey, daySlots]) => (
                <div key={dayKey}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-kotoba-text/60 mb-1">
                    {DAY_LABEL.format(new Date(dayKey))}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {daySlots.map((slot) => {
                      const isPicked = pickedSlot?.scheduled_at === slot.scheduled_at;
                      return (
                        <button
                          type="button"
                          key={slot.scheduled_at}
                          onClick={() => setPickedSlot(slot)}
                          className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                            isPicked
                              ? 'bg-kotoba-primary text-white'
                              : 'border border-kotoba-text/15 text-kotoba-text hover:border-kotoba-primary'
                          }`}
                        >
                          {TIME_LABEL.format(new Date(slot.scheduled_at))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!pack.isTrial && (
          <div className="mt-5 bg-kotoba-background/50 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm text-kotoba-text">Total</span>
            <span className="text-2xl font-extrabold text-kotoba-primary">{total}</span>
          </div>
        )}
        {pack.isTrial && (
          <div className="mt-5 bg-kotoba-primary/10 rounded-lg p-4 text-sm text-kotoba-primary font-medium">
            No payment needed — this one's on us.
          </div>
        )}

        {/* Cancellation-cutoff warning: if the picked slot is too close to
            now, the student can't cancel or get a refund. They have to
            acknowledge it before booking. */}
        {pickedSlot && (() => {
          const msUntil = new Date(pickedSlot.scheduled_at).getTime() - Date.now();
          const withinCutoff = msUntil < cutoffHours * 3600 * 1000;
          if (!withinCutoff) return null;
          return (
            <div className="mt-4 bg-kotoba-secondary/30 border border-kotoba-secondary text-kotoba-text px-4 py-3 rounded-md text-sm">
              <p className="font-semibold mb-1">Heads up: this lesson is soon.</p>
              <p className="mb-2">
                It's within the {cutoffHours}-hour cancellation window, so once you book it you can't cancel or get a refund. If you no-show, you lose the lesson.
              </p>
              <label className="inline-flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledgedCutoff}
                  onChange={(e) => setAcknowledgedCutoff(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
                />
                <span className="text-sm">I understand — book it anyway.</span>
              </label>
            </div>
          );
        })()}

        {!token && (
          <p className="mt-3 text-xs text-kotoba-text/60">
            {pack.isTrial
              ? "You'll be asked to sign in or create an account first."
              : "You'll be asked to sign in or create an account before paying."}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={(() => {
            if (submitting || !pickedSlot) return true;
            const msUntil = new Date(pickedSlot.scheduled_at).getTime() - Date.now();
            const withinCutoff = msUntil < cutoffHours * 3600 * 1000;
            return withinCutoff && !acknowledgedCutoff;
          })()}
          className="mt-4 w-full py-2.5 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
        >
          {submitting
            ? 'Loading…'
            : pack.isTrial
              ? 'Book the free trial'
              : 'Continue to checkout'}
        </button>
        <p className="mt-2 text-xs text-center text-kotoba-text/60">
          {pack.isTrial
            ? `You can cancel up to ${cutoffHours} hours before the lesson.`
            : `Card details handled by Stripe. You can cancel up to ${cutoffHours} hours before the lesson.`}
        </p>
      </div>
    </div>
  );
};

export default BookingDialog;
