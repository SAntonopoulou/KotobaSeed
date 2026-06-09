import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

// Tutor dashboard panel — every student enrolled with the current tenant,
// with booking counts and recency. Enrollment is auto-created on the
// student's first booking, so this is a low-effort "who am I teaching?"
// view. The tutor can mark someone INACTIVE to archive them.

const formatRelative = (iso) => {
  if (!iso) return '';
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  } catch {
    return '';
  }
};

const STATUS_TONE = {
  active: 'bg-kotoba-primary/15 text-kotoba-primary',
  inactive: 'bg-kotoba-text/10 text-kotoba-text/60',
};

const MyStudentsManager = () => {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('active'); // active | inactive | all
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/tutor/students');
      setRows(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your students.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (row) => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    setBusy(row.enrollment_id);
    try {
      const res = await client.patch(`/tutor/students/${row.enrollment_id}/status`, {
        status: next,
      });
      setRows((current) =>
        current.map((r) => (r.enrollment_id === row.enrollment_id ? res.data : r)),
      );
      addToast({
        message:
          next === 'inactive'
            ? `${row.student_name} archived. They stay in the roster under "All".`
            : `${row.student_name} re-activated.`,
        type: 'success',
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update.'));
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (q) {
        const hay = `${r.student_name} ${r.student_email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filter]);

  if (loading) return <SkeletonCard />;

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">My students</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Everyone who's ever booked with you. Archive students you no longer teach to keep your view clean.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          >
            <option value="active">Active</option>
            <option value="inactive">Archived</option>
            <option value="all">All</option>
          </select>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No students yet. They appear here automatically the moment they book their first lesson.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No students match the filter.
        </p>
      ) : (
        <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
          {filtered.map((row) => (
            <li
              key={row.enrollment_id}
              className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-kotoba-primary">{row.student_name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_TONE[row.status]}`}
                  >
                    {row.status}
                  </span>
                </div>
                <p className="text-xs text-kotoba-text/60 mt-0.5 truncate">
                  {row.student_email} · Active {formatRelative(row.last_active_at)} · Enrolled {formatRelative(row.first_enrolled_at)}
                </p>
                <p className="text-xs text-kotoba-text/70 mt-0.5">
                  {row.completed_bookings} completed · {row.upcoming_bookings} upcoming · {row.total_bookings} total
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await client.post(
                        `/conversations/with/${row.student_user_id}`,
                      );
                      const cid = res?.data?.conversation_id;
                      if (cid) {
                        // Inbox lives on the apex.
                        window.location.href = `/messages/${cid}`;
                      }
                    } catch (err) {
                      setError(getErrorMessage(err, 'Could not start the conversation.'));
                    }
                  }}
                  className="text-sm px-2.5 py-1 rounded-md border border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary/5"
                >
                  Message
                </button>
                <button
                  type="button"
                  onClick={() => toggleStatus(row)}
                  disabled={busy === row.enrollment_id}
                  className="text-sm text-kotoba-text/70 hover:text-kotoba-primary disabled:opacity-50"
                >
                  {row.status === 'active' ? 'Archive' : 'Re-activate'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default MyStudentsManager;
