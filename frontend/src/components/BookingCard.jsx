import React from 'react';
import { formatDateTime } from '../utils/dates';

// Shared card for rendering a single booking in any view (student
// dashboard, tutor dashboard, marketplace overview, etc.).
//
// The booking object is expected to carry `counterparty_name` —
// populated by both StudentBookingRead (= tutor's display name) and the
// tutor-side BookingRead (= student's name). The variant prop lets the
// caller tweak the framing without having to know the underlying field
// name.
//
// `action` is an optional ReactNode rendered on the right — typically
// "Mark complete" / "Join classroom" / "Cancel" buttons that the parent
// owns because they need access to mutation handlers.

// Canonical booking-status presentation. Exported so MyBookings and
// BookingsManager show the same labels/tones without each maintaining
// a near-duplicate dictionary.
export const BOOKING_STATUS_LABELS = {
  pending_payment: { label: 'Awaiting payment', tone: 'bg-yellow-100 text-yellow-800' },
  pending_group_min: { label: 'Awaiting threshold', tone: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmed', tone: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Completed', tone: 'bg-kotoba-background/60 text-kotoba-text/80' },
  cancelled: { label: 'Cancelled', tone: 'bg-kotoba-background/60 text-kotoba-text/60' },
  refunded: { label: 'Refunded', tone: 'bg-orange-100 text-orange-800' },
  no_show: { label: 'No-show', tone: 'bg-amber-100 text-amber-900' },
};

const STATUS_LABELS = BOOKING_STATUS_LABELS;

const formatPrice = (cents, currency = 'eur') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'eur').toUpperCase(),
    }).format((cents || 0) / 100);
  } catch {
    return `€${((cents || 0) / 100).toFixed(2)}`;
  }
};

const BookingCard = ({ booking, action, dense = false }) => {
  if (!booking) return null;
  const meta = STATUS_LABELS[booking.status] || {
    label: booking.status,
    tone: 'bg-kotoba-background/60 text-kotoba-text/80',
  };
  const name = booking.counterparty_name || 'Lesson';
  const pack = booking.pack_name || (booking.lesson_pack_id ? `Pack #${booking.lesson_pack_id}` : '');
  return (
    <li className={`px-4 ${dense ? 'py-2' : 'py-3'} flex items-center justify-between gap-3 flex-wrap`}>
      <div className="min-w-0">
        <div className="font-medium text-kotoba-text truncate">
          {name}
          {pack && <> · <span className="text-kotoba-text/70 font-normal">{pack}</span></>}
        </div>
        <div className="text-xs text-kotoba-text/60">
          {formatDateTime(booking.scheduled_at)} · {booking.duration_minutes} min · {formatPrice(booking.price_cents, booking.currency)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${meta.tone}`}>{meta.label}</span>
        {action}
      </div>
    </li>
  );
};

export default BookingCard;
