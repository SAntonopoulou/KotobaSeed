import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import client from '../api/client';

// Polls the platform maintenance endpoint and exposes the current
// window (or null) plus a derived "how should the SPA respond" flag.
//
// Two phases of urgency:
//   - `banner`: window is scheduled within the next 24h; render a
//     non-blocking amber strip across the app
//   - `modal`: window starts within the next 10 minutes; render a
//     non-dismissible centred dialog
//   - `active`: window is now in progress; the modal stays up and the
//     classroom + booking flows refuse new bookings
//
// Poll cadence backs off when far from the window: 5 minutes by
// default, 30 seconds inside the modal window. Endpoint is cheap
// (a single indexed lookup) so the cost is negligible.
const MaintenanceContext = createContext(null);

const FAR_POLL_MS = 5 * 60_000;
const NEAR_POLL_MS = 30_000;
const MODAL_LEAD_SECONDS = 10 * 60;
const BANNER_LEAD_SECONDS = 24 * 60 * 60;

export const MaintenanceProvider = ({ children }) => {
  const [window_, setWindow_] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await client.get('/platform/maintenance');
      setWindow_(res.data || null);
    } catch {
      // Endpoint is public — failure here usually means the backend's
      // down. The maintenance page (served by the edge) is what users
      // would see in that case; the SPA gracefully no-ops.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  // Adaptive poll interval — close to the window, poll fast; far,
  // poll slow.
  useEffect(() => {
    let interval = FAR_POLL_MS;
    if (window_ && window_.seconds_until_start <= MODAL_LEAD_SECONDS + 60) {
      interval = NEAR_POLL_MS;
    }
    const t = setInterval(fetchOnce, interval);
    return () => clearInterval(t);
  }, [window_, fetchOnce]);

  const phase = (() => {
    if (!window_) return 'none';
    if (window_.status === 'active') return 'active';
    const s = window_.seconds_until_start;
    if (s <= MODAL_LEAD_SECONDS) return 'modal';
    if (s <= BANNER_LEAD_SECONDS) return 'banner';
    return 'none';
  })();

  return (
    <MaintenanceContext.Provider value={{ window: window_, phase, loaded, refresh: fetchOnce }}>
      {children}
    </MaintenanceContext.Provider>
  );
};

export const useMaintenance = () => useContext(MaintenanceContext) || { window: null, phase: 'none', loaded: false };
