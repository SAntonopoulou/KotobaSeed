// Date/time formatters used across the SPA. Eight different inline
// approaches existed before this file; consolidating them into a small
// helper module so the UI presents times consistently.
//
// All helpers accept either a Date, an ISO string, or null/undefined
// (returning empty string for the latter so they're safe in JSX).

const _toDate = (input) => {
  if (input == null) return null;
  if (input instanceof Date) return input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
};

// "Thu, 7 Jun 2026" — used in lists, inboxes, anything that needs a
// human-friendly absolute date without a time.
export const formatDateShort = (input) => {
  const d = _toDate(input);
  if (!d) return '';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// "Thu, 7 Jun, 14:30" — bookings, lesson cards.
export const formatDateTime = (input) => {
  const d = _toDate(input);
  if (!d) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// "14:30" — used inline next to a date that's already shown.
export const formatTimeShort = (input) => {
  const d = _toDate(input);
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

// "in 2 hours" / "3 days ago" — for the "next lesson" banner and similar.
export const formatRelative = (input, now = new Date()) => {
  const d = _toDate(input);
  if (!d) return '';
  const diffMs = d - now;
  const direction = diffMs >= 0 ? 'in' : 'ago';
  const abs = Math.abs(diffMs);
  const min = Math.round(abs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return direction === 'in' ? `in ${min} min` : `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) {
    const unit = hours === 1 ? 'hour' : 'hours';
    return direction === 'in' ? `in ${hours} ${unit}` : `${hours} ${unit} ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    const unit = days === 1 ? 'day' : 'days';
    return direction === 'in' ? `in ${days} ${unit}` : `${days} ${unit} ago`;
  }
  // Beyond a week, fall back to the absolute short date.
  return formatDateShort(d);
};
