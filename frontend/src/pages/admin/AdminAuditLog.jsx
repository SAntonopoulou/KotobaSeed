import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

const PAGE_SIZE = 50;

const formatTimestamp = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const AdminAuditLog = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
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
        setError(err?.response?.data?.detail || 'Could not load the audit log.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, actionFilter, targetTypeFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit log</h1>
          <p className="mt-1 text-sm text-gray-500">Most recent admin + system actions first.</p>
        </div>
        <Link to="/admin/dashboard" className="text-sm text-indigo-600 hover:underline">
          ← Back to admin dashboard
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Action prefix
          </label>
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => {
              setPage(0);
              setActionFilter(e.target.value);
            }}
            placeholder="e.g. verification., user., tutor."
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Target type
          </label>
          <select
            value={targetTypeFilter}
            onChange={(e) => {
              setPage(0);
              setTargetTypeFilter(e.target.value);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All</option>
            <option value="user">user</option>
            <option value="project">project</option>
            <option value="verification">verification</option>
            <option value="tutor">tutor</option>
          </select>
        </div>
        <div className="text-sm text-gray-600">
          {total.toLocaleString()} entries
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">When</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Summary</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
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
                    className={`cursor-pointer ${row.details_json ? 'hover:bg-gray-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatTimestamp(row.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.actor_label}</td>
                    <td className="px-4 py-3 text-sm font-mono text-indigo-700 whitespace-nowrap">{row.action}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {row.target_type ? `${row.target_type}${row.target_id != null ? ` #${row.target_id}` : ''}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.summary}</td>
                  </tr>
                  {expanded === row.id && row.details_json && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3 text-xs font-mono text-gray-700 whitespace-pre-wrap">
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
            className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            ← Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminAuditLog;
