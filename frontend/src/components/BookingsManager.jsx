import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

const CLASSROOM_LEAD_MIN = 15;
const CLASSROOM_GRACE_MIN = 30;

const canJoinClassroom = (booking) => {
  if (booking.status !== 'confirmed') return false;
  const start = new Date(booking.scheduled_at).getTime();
  const open = start - CLASSROOM_LEAD_MIN * 60_000;
  const close = start + (booking.duration_minutes + CLASSROOM_GRACE_MIN) * 60_000;
  const now = Date.now();
  return now >= open && now <= close;
};

const formatDate = (iso) => {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
};

const formatPrice = (cents, currency = 'eur') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
};

import { BOOKING_STATUS_LABELS as STATUS_LABELS } from './BookingCard';

// Mirror the backend timing gates so the UI shows accurate affordances
// and disabled tooltips instead of just failing the API call.
// Server allows complete from `end_at - 5min`; server allows no-show
// from `start + 15min`. We hide the actions entirely until they're
// usable rather than show a 400 toast.
const COMPLETE_GRACE_MIN = 5;
const NO_SHOW_GRACE_MIN = 15;

const lessonEndMs = (b) =>
  new Date(b.scheduled_at).getTime() + b.duration_minutes * 60_000;

const canMarkComplete = (b) =>
  b.status === 'confirmed' &&
  Date.now() >= lessonEndMs(b) - COMPLETE_GRACE_MIN * 60_000;

const canMarkNoShow = (b) =>
  b.status === 'confirmed' &&
  Date.now() >= new Date(b.scheduled_at).getTime() + NO_SHOW_GRACE_MIN * 60_000;

const BookingsManager = () => {
  const confirm = useConfirm();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/bookings');
      setBookings(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load bookings.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleComplete = async (booking) => {
    if (!(await confirm({
      title: 'Mark as completed',
      message: `Mark this lesson with ${booking.student_name || 'student'} as completed?`,
      confirmText: 'Mark complete',
    }))) {
      return;
    }
    setPendingId(booking.id);
    try {
      await client.post(`/tutor/bookings/${booking.id}/complete`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not mark as complete.'));
    } finally {
      setPendingId(null);
    }
  };

  const handleNoShow = async (booking) => {
    if (!(await confirm({
      title: 'Flag as no-show',
      message: (
        `Mark ${booking.student_name || 'this student'} as a no-show for the ` +
        'lesson? They will be notified. The booking stays on the books — no refund.'
      ),
      confirmText: 'Flag no-show',
      destructive: true,
    }))) {
      return;
    }
    setPendingId(booking.id);
    try {
      await client.post(`/tutor/bookings/${booking.id}/no-show`, {});
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not flag as no-show.'));
    } finally {
      setPendingId(null);
    }
  };

  const now = Date.now();
  const upcoming = bookings.filter(
    (b) => ['pending_payment', 'confirmed'].includes(b.status) && new Date(b.scheduled_at).getTime() > now
  );
  const todo = bookings.filter(
    (b) => b.status === 'confirmed' && new Date(b.scheduled_at).getTime() <= now
  );
  const history = bookings.filter(
    (b) =>
      ['completed', 'cancelled', 'refunded', 'no_show'].includes(b.status) ||
      (b.status === 'pending_payment' && new Date(b.scheduled_at).getTime() <= now)
  );

  const Row = ({ booking, action }) => {
    const meta = STATUS_LABELS[booking.status] || { label: booking.status, tone: 'bg-kotoba-background/60 text-kotoba-text/80' };
    const [recordings, setRecordings] = useState(null);
    const [loadingRec, setLoadingRec] = useState(false);
    const showRecordingButton = booking.status === 'completed';

    const loadRecordings = async () => {
      if (recordings !== null) {
        setRecordings(null);
        return;
      }
      setLoadingRec(true);
      try {
        const res = await client.get(`/tutor/bookings/${booking.id}/recordings`);
        setRecordings(res.data || []);
      } catch {
        setRecordings([]);
      } finally {
        setLoadingRec(false);
      }
    };

    return (
      <li className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-medium text-kotoba-text">
              {booking.student_name || 'Student'} · {booking.pack_name || `Pack #${booking.lesson_pack_id}`}
            </div>
            <div className="text-xs text-kotoba-text/60">
              {formatDate(booking.scheduled_at)} · {booking.duration_minutes} min · {formatPrice(booking.price_cents, booking.currency)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {showRecordingButton && (
              <button
                type="button"
                onClick={loadRecordings}
                className="text-sm text-kotoba-text/60 hover:text-kotoba-primary"
              >
                {recordings === null ? 'Show recordings' : 'Hide'}
              </button>
            )}
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${meta.tone}`}>{meta.label}</span>
            {action}
          </div>
        </div>
        {recordings !== null && (
          <div className="ml-4 mt-1 text-xs text-kotoba-text/70 border-l-2 border-kotoba-primary/30 pl-3">
            {loadingRec ? (
              <p>Loading recordings…</p>
            ) : recordings.length === 0 ? (
              <p className="italic">No recordings — Daily.co's record button wasn't pressed during this lesson.</p>
            ) : (
              <ul className="space-y-1">
                {recordings.map((r) => {
                  const mins = Math.round((r.duration_seconds || 0) / 60);
                  return (
                    <li key={r.id}>
                      {r.started_at && formatDateTime(r.started_at)} · {mins} min ·{' '}
                      {r.download_url ? (
                        <a
                          href={r.download_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-kotoba-primary underline"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-kotoba-text/50">link expired — refresh</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </li>
    );
  };

  if (loading) {
    return <SkeletonCard rows={4} />;
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-kotoba-primary">Bookings</h2>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Mark lessons as completed once you've taught them. Completed lessons keep your dormant status fresh.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <p className="text-sm text-kotoba-text/70">
          No bookings yet. They'll appear here as students pay for lesson packs.
        </p>
      ) : (
        <div className="space-y-5">
          {todo.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-kotoba-text/50 mb-2">
                To mark complete ({todo.length})
              </h3>
              <ul className="border border-kotoba-text/10 rounded-lg divide-y divide-kotoba-text/10">
                {todo.map((b) => {
                  const completeReady = canMarkComplete(b);
                  const noShowReady = canMarkNoShow(b);
                  const completeTip = completeReady
                    ? ''
                    : `You can mark this complete after the lesson ends at ${new Date(lessonEndMs(b)).toLocaleTimeString()}.`;
                  const noShowTip = noShowReady
                    ? ''
                    : 'Give the student 15 minutes after the lesson starts before flagging a no-show.';
                  return (
                    <Row
                      key={b.id}
                      booking={b}
                      action={
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleComplete(b)}
                            disabled={pendingId === b.id || !completeReady}
                            title={completeTip}
                            className="text-sm px-3 py-1.5 rounded-md bg-kotoba-secondary text-kotoba-text font-medium hover:bg-kotoba-secondary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {pendingId === b.id ? 'Saving…' : 'Mark complete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleNoShow(b)}
                            disabled={pendingId === b.id || !noShowReady}
                            title={noShowTip}
                            className="text-sm px-3 py-1.5 rounded-md border border-amber-300 text-amber-900 font-medium hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            No-show
                          </button>
                        </div>
                      }
                    />
                  );
                })}
              </ul>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-kotoba-text/50 mb-2">
                Upcoming ({upcoming.length})
              </h3>
              <ul className="border border-kotoba-text/10 rounded-lg divide-y divide-kotoba-text/10">
                {upcoming.map((b) =>
                  canJoinClassroom(b) ? (
                    <Row
                      key={b.id}
                      booking={b}
                      action={
                        <Link
                          to={`/classroom/${b.id}`}
                          className="text-sm px-3 py-1.5 rounded-md bg-kotoba-primary text-white font-medium hover:bg-green-800"
                        >
                          Join class
                        </Link>
                      }
                    />
                  ) : (
                    <Row key={b.id} booking={b} />
                  )
                )}
              </ul>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-kotoba-text/50 mb-2">
                History ({history.length})
              </h3>
              <ul className="border border-kotoba-text/10 rounded-lg divide-y divide-kotoba-text/10">
                {history.map((b) => (
                  <Row key={b.id} booking={b} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default BookingsManager;
