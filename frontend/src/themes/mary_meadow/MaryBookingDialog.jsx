import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaXmark } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import './mary_meadow.css';

// MaryBookingDialog — themed equivalent of components/BookingDialog,
// 1:1 logic port of the Vasso/Dafni dialogs (slot fetch, cutoff guard,
// recurring opt-in, intro message, trial branch). Wrapped in
// `.theme-mary-meadow-site` so the Mary palette + fonts apply inside the
// modal layer.

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const MaryBookingDialog = ({ pack, tutorDisplayName, onClose }) => {
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

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        if (!cancelled) setError(err?.response?.data?.detail || 'Could not load times.');
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
      } catch { /* keep default */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/tutor/me');
        const tz = res.data?.timezone || res.data?.user?.timezone;
        if (tz) setTutorTimezone(tz);
      } catch { /* keep default */ }
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
      setError('Tell Mary at least a few words about what you want to learn so she can prepare.');
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
    <div className="theme-mary-meadow-site m-dlg-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="m-dlg"
        role="dialog"
        aria-modal="true"
        aria-label={pack.name}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2>{pack.name}</h2>
            <p className="m-dlg-sub">
              {pack.num_lessons} × {pack.duration_minutes} min with {tutorDisplayName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 6 }}
          >
            <FaXmark size={22} />
          </button>
        </div>

        {error && <div className="m-dlg-err">{error}</div>}
        {recurringInfo && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(147, 168, 143, 0.18)', color: 'var(--fg)', fontSize: 14 }}>
            {recurringInfo}
          </div>
        )}

        <label className="m-dlg-label">
          Pick a time {pack.num_lessons > 1 ? 'for your first lesson' : ''}
        </label>
        {loadingSlots ? (
          <p className="m-dlg-empty">Finding open times…</p>
        ) : groupedByDay.length === 0 ? (
          <div className="m-dlg-empty">
            No open times in the next three weeks. Mary may need to add availability — try again later or message her.
          </div>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 6 }}>
            {groupedByDay.map(([dayKey, daySlots]) => (
              <div key={dayKey} style={{ marginBottom: 14 }}>
                <p style={{ margin: '6px 0', fontFamily: 'var(--logo)', color: 'var(--brand)', fontSize: 18 }}>
                  {DAY_LABEL.format(new Date(dayKey))}
                </p>
                <div className="m-dlg-slot-grid" style={{ maxHeight: 'none' }}>
                  {daySlots.map((slot) => {
                    const isPicked = pickedSlot?.scheduled_at === slot.scheduled_at;
                    return (
                      <button
                        type="button"
                        key={slot.scheduled_at}
                        onClick={() => setPickedSlot(slot)}
                        className={`m-dlg-slot${isPicked ? ' selected' : ''}`}
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
        <p style={{ marginTop: 8, color: 'var(--fg-muted)', fontSize: 12 }}>
          Times shown in your time zone. Mary teaches from {tutorTimezone}.
        </p>

        {!pack.isTrial && (
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(217, 168, 86, 0.12)', borderRadius: 10 }}>
            <span style={{ fontFamily: 'var(--body)', fontWeight: 600 }}>Total</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--brand)' }}>{total}</span>
          </div>
        )}
        {pack.isTrial && (
          <div style={{ marginTop: 18, padding: 14, background: 'rgba(147, 168, 143, 0.15)', borderRadius: 10, fontFamily: 'var(--logo)', fontSize: 20, color: 'var(--fg)' }}>
            No payment — your first lesson is on the house.
          </div>
        )}

        {pack.isTrial && (
          <>
            <label className="m-dlg-label" htmlFor="mintro">
              A few words about what you want to learn
            </label>
            <textarea
              id="mintro"
              className="m-dlg-input"
              value={introMessage}
              onChange={(e) => setIntroMessage(e.target.value)}
              placeholder="What languages, your level, what you'd like to focus on…"
              rows={3}
              minLength={20}
              maxLength={2000}
              style={{ resize: 'vertical' }}
            />
          </>
        )}

        {canRecur && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={makeRecurring}
              onChange={(e) => setMakeRecurring(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <b>Make this weekly</b> — same day + time each week, four weeks ahead. You'll pay for each lesson individually before it happens.
            </span>
          </label>
        )}

        {withinCutoff && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 14, padding: 12, background: 'rgba(217, 168, 86, 0.18)', borderRadius: 10 }}>
            <input
              type="checkbox"
              checked={acknowledgedCutoff}
              onChange={(e) => setAcknowledgedCutoff(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              I understand this is within Mary's {cutoffHours}h cancellation window, so I can't cancel without losing the fee.
            </span>
          </label>
        )}

        <div className="m-dlg-actions">
          <button
            type="button"
            onClick={onClose}
            className="m-btn m-btn-outline"
            style={{ flex: '0 0 auto' }}
            disabled={submitting}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="m-btn m-btn-primary"
            style={{ flex: 1 }}
            disabled={buttonDisabled}
          >
            {submitting ? 'Booking…' : pack.isTrial ? 'Book your free lesson' : 'Continue to payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaryBookingDialog;
