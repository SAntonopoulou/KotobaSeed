import React, { useEffect, useState } from 'react';
import client from '../api/client';

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
    if (!window.confirm(`Mark this lesson with ${booking.student_name || 'student'} as completed?`)) {
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
    return (
      <li className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-medium text-kotoba-text">
            {booking.student_name || 'Student'} · {booking.pack_name || `Pack #${booking.lesson_pack_id}`}
          </div>
          <div className="text-xs text-kotoba-text/60">
            {formatDate(booking.scheduled_at)} · {booking.duration_minutes} min · {formatPrice(booking.price_cents, booking.currency)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${meta.tone}`}>{meta.label}</span>
          {action}
        </div>
      </li>
    );
  };

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Bookings</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
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
                {upcoming.map((b) => (
                  <Row key={b.id} booking={b} />
                ))}
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
