import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { tutorSiteUrl } from '../hooks/useTenant';
import { useConfirm } from '../context/ModalContext';

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

const withinCancellationCutoff = (booking) => {
  const cutoff = booking.cancellation_cutoff_hours ?? 48;
  const msUntil = new Date(booking.scheduled_at).getTime() - Date.now();
  return msUntil < cutoff * 3600 * 1000;
};

// Pre-fill the datetime-local input with `scheduled_at + 1 week` as a
// reasonable starting point. The user edits before submitting.
const toDatetimeLocal = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};

const MyBookings = () => {
  const confirm = useConfirm();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(null);
  // { bookingId: localDatetimeString } for the open reschedule form.
  const [reschedulingFor, setReschedulingFor] = useState(null);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
  // Bulk selection of cancellable bookings. Keyed by booking id.
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleSelect = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkCancel = async () => {
    if (selected.size === 0) return;
    if (!(await confirm({
      title: `Cancel ${selected.size} booking${selected.size === 1 ? '' : 's'}?`,
      message: 'Eligible bookings will be cancelled and refunded. Any inside the cancellation window stay as they are.',
      confirmText: `Cancel ${selected.size}`,
      destructive: true,
    }))) return;
    setBulkBusy(true);
    try {
      const ids = [...selected];
      await client.post('/users/me/bookings/bulk-cancel', { booking_ids: ids });
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Bulk cancel failed.');
    } finally {
      setBulkBusy(false);
    }
  };

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
    if (!(await confirm({
      title: 'Cancel booking',
      message: msg,
      confirmText: 'Cancel booking',
      destructive: true,
    }))) return;
    setCancelling(booking.id);
    setError('');
    try {
      await client.post(`/users/me/bookings/${booking.id}/cancel`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not cancel.');
    } finally {
      setCancelling(null);
    }
  };

  const openReschedule = (booking) => {
    setError('');
    setReschedulingFor(booking.id);
    // Pre-fill with one week from current scheduled_at to nudge them outside
    // the cutoff window.
    const candidate = new Date(new Date(booking.scheduled_at).getTime() + 7 * 24 * 3600 * 1000);
    setRescheduleAt(toDatetimeLocal(candidate));
  };

  const cancelReschedule = () => {
    setReschedulingFor(null);
    setRescheduleAt('');
  };

  const submitReschedule = async (booking) => {
    if (!rescheduleAt) {
      setError('Pick a new time first.');
      return;
    }
    setSubmittingReschedule(true);
    setError('');
    try {
      const iso = new Date(rescheduleAt).toISOString();
      await client.post(`/users/me/bookings/${booking.id}/reschedule`, {
        scheduled_at: iso,
      });
      cancelReschedule();
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not reschedule.');
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const canCancel = (b) =>
    ['pending_payment', 'confirmed'].includes(b.status) &&
    new Date(b.scheduled_at).getTime() > Date.now() &&
    // Pending payment bypasses the cutoff (no money on the line yet).
    (b.status === 'pending_payment' || !withinCancellationCutoff(b));

  const canReschedule = (b) =>
    b.status === 'confirmed' && !withinCancellationCutoff(b);

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 bg-kotoba-secondary/20 border border-kotoba-secondary/40 px-4 py-2 rounded-md text-sm">
          <span>
            <strong>{selected.size}</strong> booking{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-kotoba-text/70 hover:text-kotoba-text"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleBulkCancel}
              disabled={bulkBusy}
              className="px-4 py-1.5 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {bulkBusy ? 'Cancelling…' : `Cancel ${selected.size}`}
            </button>
          </div>
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
            const cutoff = b.cancellation_cutoff_hours ?? 48;
            const tooLate = b.status === 'confirmed' && withinCancellationCutoff(b);
            const isCancellable = b.status === 'confirmed' && !tooLate;
            return (
              <li key={b.id} className="px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {isCancellable && (
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggleSelect(b.id)}
                      className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
                      aria-label={`Select booking ${b.id} for bulk action`}
                    />
                  )}
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
                        className="text-xs text-kotoba-primary hover:underline"
                      >
                        Visit {b.tutor_slug}.kotobaseed.net
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${meta.tone}`}>{meta.label}</span>
                    {canJoinClassroom(b) && (
                      <Link
                        to={`/classroom/${b.id}`}
                        className="text-sm px-3 py-1 rounded-md bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                      >
                        Join
                      </Link>
                    )}
                    {canReschedule(b) && reschedulingFor !== b.id && (
                      <button
                        type="button"
                        onClick={() => openReschedule(b)}
                        className="text-sm text-kotoba-primary hover:underline"
                      >
                        Reschedule
                      </button>
                    )}
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
                    {tooLate && (
                      <span className="text-xs text-gray-500" title={`Within the ${cutoff}h cancellation window`}>
                        Locked in (within {cutoff}h)
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await client.get(`/users/me/bookings/${b.id}/ics`, {
                            responseType: 'blob',
                          });
                          const blob = new Blob([res.data], { type: 'text/calendar' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `kotobaseed-${b.id}.ics`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch {
                          /* surface via toast in a follow-up */
                        }
                      }}
                      className="text-sm text-kotoba-text/60 hover:text-kotoba-primary"
                      title="Download a calendar invite for this lesson"
                    >
                      Add to calendar
                    </button>
                    <a
                      href={`/support?booking=${b.id}&category=billing&subject=${encodeURIComponent('Help with booking #' + b.id)}`}
                      className="text-sm text-kotoba-text/60 hover:text-kotoba-primary"
                      title="Open a support ticket about this booking"
                    >
                      Get help
                    </a>
                  </div>
                </div>

                {reschedulingFor === b.id && (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm">
                    <p className="text-gray-700 mb-2">
                      Pick a new time at least {cutoff} hours from now. The tutor must be available at the new slot.
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="datetime-local"
                        value={rescheduleAt}
                        onChange={(e) => setRescheduleAt(e.target.value)}
                        disabled={submittingReschedule}
                        className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                      />
                      <button
                        type="button"
                        onClick={() => submitReschedule(b)}
                        disabled={submittingReschedule || !rescheduleAt}
                        className="text-sm px-3 py-1.5 rounded-md bg-kotoba-primary text-white font-medium hover:bg-kotoba-primary/90 disabled:opacity-60"
                      >
                        {submittingReschedule ? 'Saving…' : 'Confirm reschedule'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelReschedule}
                        disabled={submittingReschedule}
                        className="text-sm text-gray-600 hover:underline"
                      >
                        Never mind
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default MyBookings;
