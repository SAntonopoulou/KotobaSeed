import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatRelative } from '../utils/dates';

// Tiny banner shown on every apex page for signed-in students with an
// upcoming lesson. The student dashboard has the full list; this is the
// "you can't miss it" surface so they don't forget their next class.

const NextLessonBanner = () => {
  const { currentUser } = useAuth();
  const [next, setNext] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setNext(null);
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const res = await client.get('/users/me/bookings');
        const items = res.data || [];
        const now = Date.now();
        // Soonest CONFIRMED future booking.
        const upcoming = items
          .filter((b) => b.status === 'confirmed' && new Date(b.scheduled_at) > new Date(now))
          .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
        if (!cancelled) setNext(upcoming || null);
      } catch (_) {
        // Endpoint 404s for non-students (tutors, anon) — just hide.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  if (!loaded || !next) return null;

  const within15Min = new Date(next.scheduled_at) - new Date() <= 15 * 60 * 1000;
  const dashboardLink = next.tutor_slug
    ? `https://${next.tutor_slug}.${window.location.host.replace(/^[^.]+\./, '')}/classroom/${next.id}`
    : '/student/dashboard';

  return (
    <div className="bg-kotoba-secondary/30 border-b border-kotoba-secondary/50 text-kotoba-text text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-semibold">Next lesson</span>
          {next.tutor_display_name ? <> with <span className="font-medium">{next.tutor_display_name}</span></> : null}
          {' — '}
          <span className="text-kotoba-text/80">{formatRelative(next.scheduled_at)}</span>
        </p>
        {within15Min ? (
          <a
            href={dashboardLink}
            className="px-3 py-1 rounded-md bg-kotoba-primary text-white text-xs font-semibold hover:bg-kotoba-primary/90"
          >
            Join classroom
          </a>
        ) : (
          <Link
            to="/student/dashboard"
            className="px-3 py-1 rounded-md border border-kotoba-text/20 text-kotoba-text text-xs font-semibold hover:bg-white/60"
          >
            View all bookings
          </Link>
        )}
      </div>
    </div>
  );
};

export default NextLessonBanner;
