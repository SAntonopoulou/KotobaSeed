import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaXmark } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import './vasso_greek.css';

// VassoBookingDialog — themed equivalent of components/BookingDialog.
// 1:1 logic port (slot fetch, cutoff guard, recurring opt-in, intro
// message, trial branch) wrapped in `.theme-vasso-greek-site` so the
// design tokens apply inside the modal. The dialog mounts via React
// portal-style fixed positioning rather than a portal node since the
// tenant SPA already wraps its tree in a stable container.

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const VassoBookingDialog = ({ pack, tutorDisplayName, onClose }) => {
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
      className="theme-vasso-greek-site"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(8, 41, 66, 0.5)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel v-bd-dialog"
        style={{
          padding: 28,
          maxWidth: 540,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 14 }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 22,
              margin: 0,
              letterSpacing: '-0.01em',
              color: 'var(--fg)',
            }}>{pack.name}</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--fg-muted)', fontSize: 14 }}>
              {pack.num_lessons} × {pack.duration_minutes} min with {tutorDisplayName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fg-subtle)',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 9,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <FaXmark size={22} />
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', marginBottom: 10 }}>
            Pick a time {pack.num_lessons > 1 ? 'for your first lesson' : ''}
          </p>
          {loadingSlots ? (
            <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>Finding open times…</p>
          ) : groupedByDay.length === 0 ? (
            <div style={{
              fontSize: 14,
              color: 'var(--fg-muted)',
              background: 'var(--surface-sunk)',
              padding: 16,
              borderRadius: 14,
            }}>
              No open times in the next three weeks. The tutor may need to add availability — try again later or message them.
            </div>
          ) : (
            <div className="v-bd-slot-scroll" style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              maxHeight: 280,
              overflowY: 'auto',
              paddingRight: 6,
            }}>
              {groupedByDay.map(([dayKey, daySlots]) => (
                <div key={dayKey}>
                  <p style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--fg-subtle)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    margin: '0 0 6px',
                  }}>
                    {DAY_LABEL.format(new Date(dayKey))}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {daySlots.map((slot) => {
                      const isPicked = pickedSlot?.scheduled_at === slot.scheduled_at;
                      return (
                        <button
                          type="button"
                          key={slot.scheduled_at}
                          onClick={() => setPickedSlot(slot)}
                          style={{
                            padding: '7px 13px',
                            borderRadius: 999,
                            fontSize: 13.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: isPicked
                              ? '1.5px solid var(--brand)'
                              : '1.5px solid var(--border-strong)',
                            background: isPicked ? 'var(--brand)' : '#fff',
                            color: isPicked ? '#fff' : 'var(--fg)',
                            transition: 'all var(--dur) var(--ease-out)',
                          }}
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
          <div style={{
            marginTop: 20,
            background: 'var(--bg-tint)',
            borderRadius: 14,
            padding: 16,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 14, color: 'var(--fg)' }}>Total</span>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 26,
              color: 'var(--brand)',
              letterSpacing: '-0.01em',
            }}>{total}</span>
          </div>
        )}
        {pack.isTrial && (
          <div className="form-note" style={{ marginTop: 20 }}>
            No payment needed — this one's on us.
          </div>
        )}

        {pack.isTrial && (
          <div className="field" style={{ marginTop: 16 }}>
            <label className="field-label" htmlFor="vintro">
              Tell {tutorDisplayName || 'your tutor'} a bit about your goals
            </label>
            <textarea
              id="vintro"
              className="v-textarea"
              value={introMessage}
              onChange={(e) => setIntroMessage(e.target.value)}
              placeholder="What languages, level, what you'd like to focus on…"
              rows={3}
              minLength={20}
              maxLength={2000}
              required
              style={{ minHeight: 88 }}
            />
            <p style={{ fontSize: 12, color: 'var(--fg-subtle)', margin: '6px 0 0' }}>
              At least 20 characters — we'll send this as your first message so they can prep.
              {introMessage.trim().length > 0 && introMessage.trim().length < 20 && (
                <span style={{ display: 'block', color: 'var(--terra-700)', marginTop: 3 }}>
                  {20 - introMessage.trim().length} more characters please.
                </span>
              )}
            </p>
          </div>
        )}

        {withinCutoff && (
          <div style={{
            marginTop: 16,
            background: 'var(--accent-soft)',
            border: '1px solid var(--honey-300)',
            color: 'var(--fg)',
            padding: 14,
            borderRadius: 14,
            fontSize: 14,
          }}>
            <p style={{ fontWeight: 700, margin: '0 0 4px' }}>Heads up: this lesson is soon.</p>
            <p style={{ margin: '0 0 10px' }}>
              It's within the {cutoffHours}-hour cancellation window, so once you book you can't cancel or get a refund.
            </p>
            <label style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acknowledgedCutoff}
                onChange={(e) => setAcknowledgedCutoff(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 14 }}>I understand — book it anyway.</span>
            </label>
          </div>
        )}

        {canRecur && pickedSlot && (
          <label style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, marginTop: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={makeRecurring}
              onChange={(e) => setMakeRecurring(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 14, color: 'var(--fg)' }}>
              Make this a recurring weekly lesson — same time every week. Cancel any time.
            </span>
          </label>
        )}

        {recurringInfo && <p className="form-note" style={{ marginTop: 14 }}>{recurringInfo}</p>}

        {!token && (
          <p style={{ marginTop: 14, fontSize: 12, color: 'var(--fg-subtle)' }}>
            {pack.isTrial
              ? "You'll be asked to sign in or create an account first."
              : "You'll be asked to sign in or create an account before paying."}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={buttonDisabled}
          className="v-btn v-btn-gold v-btn-lg"
          style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}
        >
          {submitting
            ? 'Loading…'
            : pack.isTrial
              ? 'Book the free trial'
              : makeRecurring
                ? 'Set up recurring weekly lessons'
                : 'Continue to checkout'}
        </button>
        <p style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: 'var(--fg-subtle)' }}>
          {pack.isTrial
            ? `You can cancel up to ${cutoffHours} hours before the lesson.`
            : `Card details handled by Stripe. You can cancel up to ${cutoffHours} hours before the lesson.`}
        </p>
      </div>
    </div>
  );
};

export default VassoBookingDialog;
