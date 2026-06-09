import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaXmark } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import './dafni_botanical.css';

// DafniBookingDialog — themed equivalent of components/BookingDialog,
// 1:1 logic port of VassoBookingDialog (slot fetch, cutoff guard,
// recurring opt-in, intro message, trial branch). Only visuals change:
// cream dialog body, sage hairline border, Fraunces italic title,
// terracotta selected-slot pills. Wrapped in `.theme-dafni-botanical-site`
// so the theme tokens apply inside the modal layer.

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const DafniBookingDialog = ({ pack, tutorDisplayName, onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [pickedSlot, setPickedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [cutoffHours, setCutoffHours] = useState(48);
  const [acknowledgedCutoff, setAcknowledgedCutoff] = useState(false);
  const [tutorTimezone, setTutorTimezone] = useState('UTC');
  const canRecur = !pack.isTrial && !pack.is_group && pack.num_lessons === 1;
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [recurringInfo, setRecurringInfo] = useState('');
  const [introMessage, setIntroMessage] = useState('');

  // Body scroll lock — restores cleanly on unmount.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);

  // ESC closes the dialog — matches the rest of the Dafni theme drawer.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Slot fetch — trial uses its own endpoint.
  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    setError('');
    (async () => {
      try {
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
    return () => { cancelled = true; };
  }, [pack.id, pack.isTrial]);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/tutor/policy');
        if (res.data?.cancellation_cutoff_hours) {
          setCutoffHours(res.data.cancellation_cutoff_hours);
        }
      } catch { /* fall back to 48h */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/tutor/me');
        const tz = res.data?.timezone || res.data?.user?.timezone;
        if (tz) setTutorTimezone(tz);
      } catch { /* fall back to UTC */ }
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

  const handleConfirm = async () => {
    if (!pickedSlot) { setError('Pick a time to continue.'); return; }
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      navigate(`/login?next=${next}`);
      return;
    }
    if (pack.isTrial && introMessage.trim().length < 20) {
      setError('Add at least 20 characters about your goals so your tutor can prep.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (pack.isTrial) {
        const res = await client.post('/tutor/trial/book', {
          scheduled_at: pickedSlot.scheduled_at,
          initial_message: introMessage.trim() || null,
        });
        const bookingId = res.data?.booking_id;
        window.location.href = `/booking/success?booking=${bookingId ?? ''}&trial=1`;
        return;
      }
      if (makeRecurring && canRecur) {
        const slotDate = new Date(pickedSlot.scheduled_at);
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tutorTimezone,
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const parts = fmt.formatToParts(slotDate);
        const wd = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
        const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
        const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
        const WEEKDAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
        const day_of_week = WEEKDAY[wd] ?? 0;
        const start_minute = hh * 60 + mm;
        await client.post('/recurring/plans', {
          lesson_pack_id: pack.id,
          day_of_week,
          start_minute,
          start_date: pickedSlot.scheduled_at,
          lookahead_weeks: 4,
        });
        setRecurringInfo(
          'Recurring plan saved. Your weekly bookings are in your dashboard — pay for each one before the lesson.',
        );
        setTimeout(onClose, 2500);
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

  const withinCutoff = pickedSlot && (() => {
    const msUntil = new Date(pickedSlot.scheduled_at).getTime() - Date.now();
    return msUntil < cutoffHours * 3600 * 1000;
  })();

  const buttonDisabled = (() => {
    if (submitting || !pickedSlot) return true;
    if (withinCutoff && !acknowledgedCutoff) return true;
    return false;
  })();

  return (
    <div
      className="theme-dafni-botanical-site d-bd-overlay"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="d-bd-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={pack.name}
      >
        <div className="d-bd-head">
          <div>
            <h2 className="d-bd-title">{pack.name}</h2>
            <p className="d-bd-sub">
              {pack.num_lessons} × {pack.duration_minutes} min with {tutorDisplayName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="d-bd-close"
          >
            <FaXmark size={22} />
          </button>
        </div>

        <div className="d-bd-rule" aria-hidden="true" />

        {error && <p className="d-form-error">{error}</p>}

        <div>
          <p className="d-bd-section-label">
            Pick a time {pack.num_lessons > 1 ? 'for your first lesson' : ''}
          </p>
          {loadingSlots ? (
            <p className="d-bd-loading">Finding open times…</p>
          ) : groupedByDay.length === 0 ? (
            <div className="d-bd-empty-slots">
              No open times in the next three weeks. The tutor may need to add availability — try again later or message them.
            </div>
          ) : (
            <div className="d-bd-slot-scroll">
              {groupedByDay.map(([dayKey, daySlots]) => (
                <div key={dayKey}>
                  <p className="d-bd-day-label">
                    {DAY_LABEL.format(new Date(dayKey))}
                  </p>
                  <div className="d-bd-slot-row">
                    {daySlots.map((slot) => {
                      const isPicked = pickedSlot?.scheduled_at === slot.scheduled_at;
                      return (
                        <button
                          type="button"
                          key={slot.scheduled_at}
                          onClick={() => setPickedSlot(slot)}
                          className={`d-bd-slot${isPicked ? ' d-bd-slot-picked' : ''}`}
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
          <p className="d-bd-tz-note">
            Times shown in your time zone. Your tutor teaches from {tutorTimezone}.
          </p>
        </div>

        {!pack.isTrial && (
          <div className="d-bd-total">
            <span className="d-bd-total-label">Total</span>
            <span className="d-bd-total-amt">{total}</span>
          </div>
        )}
        {pack.isTrial && (
          <div className="d-bd-trial-note">
            No payment needed — your first lesson is on the house.
          </div>
        )}

        {pack.isTrial && (
          <div className="d-field" style={{ marginTop: 16 }}>
            <label className="d-field-label" htmlFor="dintro">
              Tell {tutorDisplayName || 'your tutor'} a bit about your goals
            </label>
            <textarea
              id="dintro"
              className="d-textarea"
              value={introMessage}
              onChange={(e) => setIntroMessage(e.target.value)}
              placeholder="What languages, level, what you'd like to focus on…"
              rows={3}
              minLength={20}
              maxLength={2000}
              required
            />
            <p className="d-bd-intro-hint">
              At least 20 characters — we'll send this as your first message so they can prep.
              {introMessage.trim().length > 0 && introMessage.trim().length < 20 && (
                <span className="d-bd-intro-warn">
                  {20 - introMessage.trim().length} more characters please.
                </span>
              )}
            </p>
          </div>
        )}

        {withinCutoff && (
          <div className="d-bd-cutoff">
            <p className="d-bd-cutoff-title">Heads up: this lesson is soon.</p>
            <p className="d-bd-cutoff-body">
              It's within the {cutoffHours}-hour cancellation window, so once you book you can't cancel or get a refund.
            </p>
            <label className="d-checkbox-row">
              <input
                type="checkbox"
                checked={acknowledgedCutoff}
                onChange={(e) => setAcknowledgedCutoff(e.target.checked)}
              />
              <span>I understand — book it anyway.</span>
            </label>
          </div>
        )}

        {canRecur && pickedSlot && (
          <label className="d-checkbox-row" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={makeRecurring}
              onChange={(e) => setMakeRecurring(e.target.checked)}
            />
            <span>
              Make this a recurring weekly lesson — same time every week. Cancel any time.
            </span>
          </label>
        )}

        {recurringInfo && <p className="d-form-success" style={{ marginTop: 14 }}>{recurringInfo}</p>}

        {!token && (
          <p className="d-bd-signin-note">
            {pack.isTrial
              ? "You'll be asked to sign in or create an account first."
              : "You'll be asked to sign in or create an account before paying."}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={buttonDisabled}
          className="d-btn d-btn-primary d-btn-lg d-bd-confirm"
        >
          {submitting
            ? 'Loading…'
            : pack.isTrial
              ? 'Book the free trial'
              : makeRecurring
                ? 'Set up recurring weekly lessons'
                : 'Continue to checkout'}
        </button>
        <p className="d-bd-foot-note">
          {pack.isTrial
            ? `You can cancel up to ${cutoffHours} hours before the lesson.`
            : `Card details handled by Stripe. You can cancel up to ${cutoffHours} hours before the lesson.`}
        </p>
      </div>
    </div>
  );
};

export default DafniBookingDialog;
