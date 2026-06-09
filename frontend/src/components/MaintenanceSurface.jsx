import React from 'react';
import { useMaintenance } from '../context/MaintenanceContext';
import { formatDateTime } from '../utils/dates';

// Renders nothing, a banner, or a hard modal depending on how close
// we are to the scheduled window. The active-window state keeps the
// modal up so the user knows the site is mid-maintenance — but the
// classroom route is whitelisted (Caddy doesn't route the maintenance
// page over /classroom/*, and the modal here is skipped in that
// subtree so an in-progress lesson finishes cleanly).

const formatCountdown = (seconds) => {
  if (seconds <= 0) return 'now';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(seconds / 3600);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(seconds / 86400);
  return `${d} day${d === 1 ? '' : 's'}`;
};

const MaintenanceSurface = () => {
  const { window: w, phase } = useMaintenance();
  // Don't disrupt anyone mid-lesson — the classroom route handles its
  // own session lifecycle.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/classroom')) {
    return null;
  }
  if (!w || phase === 'none') return null;

  if (phase === 'banner') {
    return (
      <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 text-sm flex items-center justify-center gap-3">
        <span className="font-semibold">Scheduled maintenance:</span>
        <span>
          {formatDateTime(w.scheduled_start_at)} ({w.duration_minutes} min). Lessons inside the window have been credited automatically.
        </span>
      </div>
    );
  }

  // phase === 'modal' || 'active'
  const isActive = phase === 'active';
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-7 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-amber-700 text-xl font-bold" aria-hidden="true">!</span>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-kotoba-text">
              {isActive ? 'Maintenance in progress' : 'Maintenance starts soon'}
            </h2>
            <p className="mt-1 text-sm text-kotoba-text/70">
              {isActive
                ? 'Kotobaseed is briefly offline while we ship an update.'
                : `Starting in about ${formatCountdown(Math.max(0, w.seconds_until_start))}.`}
            </p>
          </div>
        </div>
        <div className="text-sm text-kotoba-text whitespace-pre-wrap">
          {w.message}
        </div>
        <div className="text-xs text-kotoba-text/60 border-t border-kotoba-text/10 pt-3 space-y-1">
          <p>Expected duration: {w.duration_minutes} minutes.</p>
          {!isActive && (
            <p>Wrap up what you're doing — new bookings and checkouts pause until we're back.</p>
          )}
          {isActive && (
            <p>This dialog closes by itself once we're back online. Lessons currently in progress can finish.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaintenanceSurface;
