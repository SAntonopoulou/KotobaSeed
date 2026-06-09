import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../utils/errors';

// Full-screen Daily.co iframe for the tutor's practice room. Mounted on
// the tenant subdomain at /demo-classroom; not themed per tenant — this
// is an internal back-office surface.
//
// The room url + token come from sessionStorage, written by
// DemoClassroomCard right before navigating. If they're missing (deep
// link, refresh after the modal flow ended) we mint a fresh pair by
// POSTing to /tutor/demo-classroom directly.
//
// While the page is mounted we POST /tutor/demo-classroom/heartbeat
// every 60 seconds. A 403 means the tutor went over quota mid-session —
// we stop the loop, drop a toast, and send them back to the dashboard.

const HEARTBEAT_INTERVAL_MS = 60_000;

const DemoClassroom = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [session, setSessionData] = useState(null);
  const [error, setError] = useState('');
  const [minutesToday, setMinutesToday] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const stashed = sessionStorage.getItem('demo-classroom-session');
    if (stashed) {
      try {
        const parsed = JSON.parse(stashed);
        if (parsed && parsed.room_url && parsed.token) {
          setSessionData(parsed);
          return () => {};
        }
      } catch {
        // fall through to a fresh mint
      }
    }

    (async () => {
      try {
        const res = await client.post('/tutor/demo-classroom');
        if (!cancelled) {
          setSessionData({
            room_url: res.data.room_url,
            token: res.data.token,
            expires_at: res.data.expires_at,
          });
        }
      } catch (err) {
        if (cancelled) return;
        const code = err?.response?.status;
        if (code === 403) {
          setError(
            "You're over your monthly minute quota — practice room is paused until your quota resets or you top up.",
          );
        } else {
          setError(
            getErrorMessage(err, "Couldn't open the practice room. Try again from your dashboard."),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Heartbeat loop. Stops cleanly on unmount, and bails (with toast) if
  // the backend ever returns 403 mid-session.
  useEffect(() => {
    if (!session) return undefined;

    const ping = async () => {
      try {
        const res = await client.post('/tutor/demo-classroom/heartbeat');
        setMinutesToday(res.data?.minutes_logged_today ?? null);
        if (res.data?.over_quota) {
          addToast(
            "You've hit your monthly minute quota — wrapping up the practice room.",
            'error',
          );
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          navigate('/dashboard#lessons');
        }
      } catch (err) {
        const code = err?.response?.status;
        if (code === 403) {
          addToast(
            "You're over your monthly minute quota — practice room is paused until your quota resets or you top up.",
            'error',
          );
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          navigate('/dashboard#lessons');
        }
        // Other errors (network blip) — just try again on the next tick.
      }
    };

    // Stamp the first minute right away, then once every 60s.
    ping();
    intervalRef.current = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Clear the stash so a refresh on this URL mints a fresh room
      // rather than reusing an expired token.
      sessionStorage.removeItem('demo-classroom-session');
    };
  }, [session, addToast, navigate]);

  if (error) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-soft p-8 max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold text-kotoba-primary">
            Practice room unavailable
          </h1>
          <p className="text-kotoba-text">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard#lessons')}
            className="inline-block px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center">
        <p className="text-kotoba-text">Opening your practice room…</p>
      </div>
    );
  }

  const src = `${session.room_url}?t=${encodeURIComponent(session.token)}`;
  const minutesLabel = minutesToday == null ? '…' : `${minutesToday} min`;

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-kotoba-primary text-white text-sm">
        <div className="font-medium">
          Practice classroom · time used today: {minutesLabel} · ⏱
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard?section=lessons')}
          className="px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 font-semibold"
        >
          Exit
        </button>
      </div>
      <iframe
        title="Practice classroom"
        src={src}
        allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
        className="flex-1 w-full border-0"
      />
    </div>
  );
};

export default DemoClassroom;
