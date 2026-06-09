import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { apexUrl } from '../../hooks/useTenant';
import { SkeletonCard } from '../Skeleton';
import { getErrorMessage } from '../../utils/errors';

// Tutor's "start your shift" surface. Fetches confirmed bookings, finds
// the very next one + everything scheduled today, and surfaces a Join
// button that goes live 15 min before the lesson. Ticks every 10s so
// "starts in 12 min" stays honest while the tutor sips coffee.

const LEAD_MIN = 15; // minutes before scheduled_at when "Join" lights up
const GRACE_MIN = 30; // how long after the end we still allow re-joining

const useNow = () => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  return now;
};

const formatClock = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const formatDateline = (iso, now) => {
  if (!iso) return '';
  const then = new Date(iso);
  const today = new Date(now);
  const sameDay =
    then.getFullYear() === today.getFullYear() &&
    then.getMonth() === today.getMonth() &&
    then.getDate() === today.getDate();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    then.getFullYear() === tomorrow.getFullYear() &&
    then.getMonth() === tomorrow.getMonth() &&
    then.getDate() === tomorrow.getDate();
  if (sameDay) return `Today at ${formatClock(iso)}`;
  if (isTomorrow) return `Tomorrow at ${formatClock(iso)}`;
  return then.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCountdown = (msUntil) => {
  if (msUntil <= 0) return 'Starting now';
  const totalSec = Math.floor(msUntil / 1000);
  const days = Math.floor(totalSec / 86400);
  if (days >= 1) return `In ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(totalSec / 3600);
  if (hours >= 1) {
    const mins = Math.floor((totalSec % 3600) / 60);
    return mins > 0 ? `In ${hours}h ${mins}m` : `In ${hours}h`;
  }
  const mins = Math.floor(totalSec / 60);
  if (mins >= 1) return `In ${mins} min`;
  return 'In under a minute';
};

const NextLessonCard = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const now = useNow();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/tutor/bookings');
        if (!cancelled) setRows(res.data || []);
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Could not load bookings.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetch periodically so a brand-new booking from the student side
  // shows up without a hard refresh. Cheap because the endpoint is
  // tenant-scoped and counts/aggregates are small.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await client.get('/tutor/bookings');
        setRows(res.data || []);
      } catch {
        /* swallow — already-rendered state stays usable */
      }
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const { next, todayList } = useMemo(() => {
    const upcoming = rows
      .filter((b) => b.status === 'confirmed')
      .filter(
        (b) =>
          new Date(b.scheduled_at).getTime() +
            (b.duration_minutes + GRACE_MIN) * 60_000 >
          now,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime(),
      );

    const today = new Date(now);
    const todayList = upcoming.filter((b) => {
      const d = new Date(b.scheduled_at);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    });

    return { next: upcoming[0] || null, todayList };
  }, [rows, now]);

  if (loading) return <SkeletonCard />;
  if (error) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary">Your next lesson</h2>
        <p className="text-sm text-red-700 mt-1">{error}</p>
      </section>
    );
  }

  if (!next) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary">Your next lesson</h2>
        <p className="text-sm text-kotoba-text/70 mt-2">
          No confirmed lessons coming up. When a student books, you'll see the countdown right here.
        </p>
      </section>
    );
  }

  const start = new Date(next.scheduled_at).getTime();
  const msUntil = start - now;
  const joinOpensAt = start - LEAD_MIN * 60_000;
  const joinClosesAt = start + (next.duration_minutes + GRACE_MIN) * 60_000;
  const canJoin = now >= joinOpensAt && now <= joinClosesAt;
  const inSession =
    now >= start && now <= start + next.duration_minutes * 60_000;

  const minsUntilOpen = Math.max(0, Math.ceil((joinOpensAt - now) / 60_000));
  const studentLabel = next.student_name || `Student #${next.student_user_id}`;
  const packLabel = next.pack_name || `${next.duration_minutes}-min lesson`;

  return (
    <>
      <section
        className={`rounded-2xl p-6 shadow-sm ${
          inSession
            ? 'bg-green-50 ring-2 ring-green-400'
            : canJoin
            ? 'bg-kotoba-primary/5 ring-2 ring-kotoba-primary'
            : 'bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60">
              Your next lesson
            </p>
            <h2 className="mt-1 text-2xl font-bold text-kotoba-primary">
              {studentLabel}
            </h2>
            <p className="mt-1 text-base text-kotoba-text">
              {packLabel} · {formatDateline(next.scheduled_at, now)}
            </p>
            <p
              className={`mt-2 text-sm font-semibold ${
                inSession
                  ? 'text-green-700'
                  : canJoin
                  ? 'text-kotoba-primary'
                  : 'text-kotoba-text/70'
              }`}
            >
              {inSession
                ? 'In session — students may already be there.'
                : canJoin
                ? `Classroom is open · ${formatCountdown(msUntil)}`
                : `${formatCountdown(msUntil)} · Join button opens ${minsUntilOpen} min before`}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 min-w-[160px]">
            {canJoin ? (
              <Link
                to={`/classroom/${next.id}`}
                className="text-center px-5 py-3 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
              >
                Join classroom
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="text-center px-5 py-3 rounded-md bg-kotoba-text/10 text-kotoba-text/40 font-semibold cursor-not-allowed"
                title={`Opens ${LEAD_MIN} min before the lesson`}
              >
                Join classroom
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await client.post(
                    `/conversations/with/${next.student_user_id}`,
                  );
                  const cid = res?.data?.conversation_id;
                  if (cid) {
                    window.location.href = apexUrl(`/messages/${cid}`);
                  }
                } catch (err) {
                  setError(getErrorMessage(err, 'Could not start the conversation.'));
                }
              }}
              className="text-center px-4 py-2 rounded-md border border-kotoba-primary text-kotoba-primary text-sm font-medium hover:bg-kotoba-primary/5"
            >
              Message {studentLabel.split(' ')[0]}
            </button>
          </div>
        </div>
      </section>

      {todayList.length > 1 && (
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-kotoba-text/60 mb-3">
            Rest of today ({todayList.length - 1})
          </h3>
          <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
            {todayList.slice(1).map((b) => {
              const bStart = new Date(b.scheduled_at).getTime();
              const bOpen = bStart - LEAD_MIN * 60_000;
              const bClose = bStart + (b.duration_minutes + GRACE_MIN) * 60_000;
              const bCanJoin = now >= bOpen && now <= bClose;
              return (
                <li
                  key={b.id}
                  className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-kotoba-primary">
                      {formatClock(b.scheduled_at)} · {b.student_name || `Student #${b.student_user_id}`}
                    </p>
                    <p className="text-xs text-kotoba-text/60">
                      {b.pack_name || `${b.duration_minutes}-min lesson`}
                    </p>
                  </div>
                  {bCanJoin ? (
                    <Link
                      to={`/classroom/${b.id}`}
                      className="text-sm px-3 py-1.5 rounded-md bg-kotoba-primary text-white font-medium hover:bg-kotoba-primary/90"
                    >
                      Join
                    </Link>
                  ) : (
                    <span className="text-xs text-kotoba-text/50">
                      {formatCountdown(bStart - now)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
};

export default NextLessonCard;
