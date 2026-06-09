import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/dates';

const PAGE_SIZE = 50;

const formatTimestamp = (iso) => {
  if (!iso) return '';
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
};

// Quick-filter buttons for common action prefixes. Each button drops the
// other filters so admin can pivot fast.
const QUICK_FILTERS = [
  { label: 'All', prefix: '' },
  { label: 'Support', prefix: 'support.' },
  { label: 'Settings', prefix: 'settings.' },
  { label: 'Role changes', prefix: 'user.role' },
  { label: 'User deletes', prefix: 'user.deleted' },
  { label: 'Verifications', prefix: 'verification.' },
  { label: 'Projects', prefix: 'project.' },
  { label: 'Tutor', prefix: 'tutor.' },
];

const TARGET_TYPES = [
  '',
  'user',
  'project',
  'verification',
  'tutor',
  'platform_setting',
  'support_ticket',
];

// Action tag chip — distinguishes destructive vs read-style actions visually.
const actionTone = (action) => {
  if (action.includes('delete') || action.includes('rejected')) {
    return 'bg-red-100 text-red-800';
  }
  if (action.includes('escalated') || action.includes('priority')) {
    return 'bg-amber-100 text-amber-900';
  }
  if (action.includes('approved') || action.includes('resolved')) {
    return 'bg-green-100 text-green-800';
  }
  if (action.startsWith('support.')) {
    return 'bg-kotoba-secondary/30 text-kotoba-text';
  }
  if (action.startsWith('settings.')) {
    return 'bg-kotoba-primary/15 text-kotoba-primary';
  }
  return 'bg-kotoba-primary/15 text-kotoba-primary';
};

const AdminAuditLog = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [actorInput, setActorInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    if (targetTypeFilter) params.set('target_type', targetTypeFilter);
    if (actorFilter) params.set('actor', actorFilter);
    params.set('limit', PAGE_SIZE);
    params.set('offset', page * PAGE_SIZE);

    client
      .get(`/admin/audit-log?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, 'Could not load the audit log.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, actionFilter, targetTypeFilter, actorFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyActorFilter = (e) => {
    e?.preventDefault?.();
    setPage(0);
    setActorFilter(actorInput.trim());
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-kotoba-primary">Audit log</h1>
          <p className="mt-1 text-sm text-kotoba-text/60">
            Every staff + system action, most recent first. Click a row to see the raw details.
          </p>
        </div>
        <Link to="/admin/dashboard" className="text-sm text-kotoba-primary hover:underline">
          ← Back to admin dashboard
        </Link>
      </div>

      {/* Quick filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {QUICK_FILTERS.map((qf) => {
          const active = actionFilter === qf.prefix;
          return (
            <button
              key={qf.label}
              type="button"
              onClick={() => {
                setPage(0);
                setActionFilter(qf.prefix);
              }}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                active
                  ? 'bg-kotoba-primary text-white border-kotoba-primary'
                  : 'bg-white text-kotoba-text border-kotoba-text/15 hover:border-kotoba-primary'
              }`}
            >
              {qf.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white shadow rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-kotoba-text/60 uppercase tracking-wide mb-1">
            Action prefix
          </label>
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => {
              setPage(0);
              setActionFilter(e.target.value);
            }}
            placeholder="e.g. verification., support., settings."
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <div className="min-w-[180px]">
          <label className="block text-xs font-medium text-kotoba-text/60 uppercase tracking-wide mb-1">
            Target type
          </label>
          <select
            value={targetTypeFilter}
            onChange={(e) => {
              setPage(0);
              setTargetTypeFilter(e.target.value);
            }}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          >
            {TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t || 'All'}
              </option>
            ))}
          </select>
        </div>
        <form onSubmit={applyActorFilter} className="flex-1 min-w-[220px] flex gap-2">
          <div className="flex-grow">
            <label className="block text-xs font-medium text-kotoba-text/60 uppercase tracking-wide mb-1">
              Actor (email or label substring)
            </label>
            <input
              type="text"
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              placeholder="e.g. support@kotobaseed.net"
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-kotoba-primary text-white text-sm font-medium hover:bg-kotoba-primary/90 self-end"
          >
            Filter
          </button>
          {actorFilter && (
            <button
              type="button"
              onClick={() => {
                setActorFilter('');
                setActorInput('');
                setPage(0);
              }}
              className="px-3 py-2 rounded-md border border-kotoba-text/20 text-sm self-end hover:bg-kotoba-text/5"
            >
              Clear
            </button>
          )}
        </form>
        <div className="text-sm text-kotoba-text/60">
          {total.toLocaleString()} entries
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white shadow sm:rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-kotoba-text/10">
          <thead className="bg-kotoba-background/40">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">When</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">Actor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">Target</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">Summary</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-kotoba-text/10">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-kotoba-text/60">Loading…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-kotoba-text/60">
                  No entries match these filters.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <React.Fragment key={row.id}>
                  <tr
                    onClick={() =>
                      setExpanded(expanded === row.id ? null : row.id)
                    }
                    className={`cursor-pointer hover:bg-kotoba-background/30`}
                  >
                    <td className="px-4 py-3 text-sm text-kotoba-text/70 whitespace-nowrap">{formatTimestamp(row.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-kotoba-text whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (row.actor_user_id) {
                            setActorInput(row.actor_label);
                            setActorFilter(row.actor_label);
                            setPage(0);
                          }
                        }}
                        title="Filter by this actor"
                        className="hover:text-kotoba-primary"
                      >
                        {row.actor_label}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono ${actionTone(row.action)}`}>
                        {row.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-kotoba-text/70 whitespace-nowrap">
                      {row.target_type ? `${row.target_type}${row.target_id != null ? ` #${row.target_id}` : ''}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-kotoba-text">{row.summary}</td>
                  </tr>
                  {expanded === row.id && row.details_json && (
                    <tr className="bg-kotoba-background/30">
                      <td colSpan={5} className="px-4 py-3 text-xs font-mono text-kotoba-text whitespace-pre-wrap">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(row.details_json), null, 2);
                          } catch {
                            return row.details_json;
                          }
                        })()}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 rounded-md border border-kotoba-text/20 text-sm font-medium text-kotoba-text hover:bg-kotoba-background/30 disabled:opacity-50"
          >
            ← Previous
          </button>
          <span className="text-sm text-kotoba-text/60">
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-md border border-kotoba-text/20 text-sm font-medium text-kotoba-text hover:bg-kotoba-background/30 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminAuditLog;
