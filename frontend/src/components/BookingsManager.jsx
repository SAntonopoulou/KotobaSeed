import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { SkeletonCard } from './Skeleton';

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
    return new Date(iso).toLocaleString();
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

const STATUS_LABELS = {
  pending_payment: { label: 'Awaiting payment', tone: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmed', tone: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Completed', tone: 'bg-gray-100 text-gray-700' },
  cancelled: { label: 'Cancelled', tone: 'bg-gray-100 text-gray-500' },
  refunded: { label: 'Refunded', tone: 'bg-orange-100 text-orange-800' },
};

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
      setError(err?.response?.data?.detail || 'Could not load bookings.');
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
      setError(err?.response?.data?.detail || 'Could not mark as complete.');
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
      ['completed', 'cancelled', 'refunded'].includes(b.status) ||
      (b.status === 'pending_payment' && new Date(b.scheduled_at).getTime() <= now)
  );

  const Row = ({ booking, action }) => {
    const meta = STATUS_LABELS[booking.status] || { label: booking.status, tone: 'bg-gray-100 text-gray-700' };
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
                      {r.started_at && new Date(r.started_at).toLocaleString()} · {mins} min ·{' '}
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
                {todo.map((b) => (
                  <Row
                    key={b.id}
                    booking={b}
                    action={
                      <button
                        type="button"
                        onClick={() => handleComplete(b)}
                        disabled={pendingId === b.id}
                        className="text-sm px-3 py-1.5 rounded-md bg-kotoba-secondary text-kotoba-text font-medium hover:bg-kotoba-secondary-dark disabled:opacity-60"
                      >
                        {pendingId === b.id ? 'Saving…' : 'Mark complete'}
                      </button>
                    }
                  />
                ))}
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
