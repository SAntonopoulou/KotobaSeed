import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { tutorSiteUrl } from '../hooks/useTenant';

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

const MyBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/users/me/bookings');
      setBookings(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCancel = async (booking) => {
    const msg = booking.status === 'confirmed'
      ? `Cancel this booking and refund ${formatPrice(booking.price_cents, booking.currency)}?`
      : 'Cancel this booking?';
    if (!window.confirm(msg)) return;
    setCancelling(booking.id);
    try {
      await client.post(`/users/me/bookings/${booking.id}/cancel`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not cancel.');
    } finally {
      setCancelling(null);
    }
  };

  const canCancel = (b) =>
    ['pending_payment', 'confirmed'].includes(b.status) &&
    new Date(b.scheduled_at).getTime() > Date.now();

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <p className="text-sm text-gray-500">
          No bookings yet. Visit a tutor's site to book your first lesson.
        </p>
      ) : (
        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-200">
          {bookings.map((b) => {
            const meta = STATUS_LABELS[b.status] || { label: b.status, tone: 'bg-gray-100 text-gray-700' };
            return (
              <li key={b.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-medium text-gray-900">
                    {b.tutor_display_name || 'Tutor'} · {b.pack_name || 'Lesson pack'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(b.scheduled_at)} · {b.duration_minutes} min · {formatPrice(b.price_cents, b.currency)}
                  </div>
                  {b.tutor_slug && (
                    <a
                      href={tutorSiteUrl(b.tutor_slug, '/')}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Visit {b.tutor_slug}.kotobaseed.net
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${meta.tone}`}>{meta.label}</span>
                  {canCancel(b) && (
                    <button
                      type="button"
                      onClick={() => handleCancel(b)}
                      disabled={cancelling === b.id}
                      className="text-sm text-red-700 hover:underline disabled:opacity-60"
                    >
                      {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default MyBookings;
