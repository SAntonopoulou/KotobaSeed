import React, { useCallback, useEffect, useState } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/dates';
import { getErrorMessage } from '../../utils/errors';
import PromptModal from '../../components/PromptModal';

// DSA Article 16 notice queue. Anyone — user or non-user — can submit
// via the public /legal/report-content form, and the rows land here for
// human review per Article 16(6). Decisions move them to acknowledged,
// actioned, or dismissed; the decision_reason becomes the statement of
// reasons we send the affected user under Article 17.

const STATUS_TABS = [
  { key: 'open', label: 'Open' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'actioned', label: 'Actioned' },
  { key: 'dismissed', label: 'Dismissed' },
];

const STATUS_BADGE = {
  open: 'bg-amber-100 text-amber-900',
  acknowledged: 'bg-sky-100 text-sky-900',
  actioned: 'bg-green-100 text-green-900',
  dismissed: 'bg-gray-100 text-gray-700',
};

const AdminReports = () => {
  const { addToast } = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');
  const [busyId, setBusyId] = useState(null);
  const [promptState, setPromptState] = useState({
    open: false,
    report: null,
    status: 'actioned',
  });

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/reports', {
        params: { status_filter: tab },
      });
      setReports(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load reports.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, tab]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const openPrompt = (report, status) =>
    setPromptState({ open: true, report, status });
  const cancelPrompt = () =>
    setPromptState({ open: false, report: null, status: 'actioned' });

  const submitResolution = async (reason) => {
    const { report, status } = promptState;
    cancelPrompt();
    if (!report) return;
    if (!reason || reason.trim().length < 3) {
      addToast('Please include a brief reason for the decision.', 'error');
      return;
    }
    setBusyId(report.id);
    try {
      await client.post(`/admin/reports/${report.id}/decide`, {
        status,
        decision_reason: reason,
      });
      addToast(`Report marked ${status}.`, 'success');
      fetchReports();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not update report.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-kotoba-primary">
          Illegal-content notices (DSA Art 16)
        </h1>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Notices submitted via the public report form. Every decision must
          include a short statement of reasons — it goes into the DSA Art 17
          notice to the affected user.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-kotoba-primary text-white'
                : 'bg-white border border-kotoba-text/10 text-kotoba-text hover:bg-kotoba-background'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-kotoba-text/60">Loading…</p>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-kotoba-text/10 p-10 text-center text-sm text-kotoba-text/60">
          Nothing in this queue.
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="bg-white rounded-2xl border border-kotoba-text/10 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${STATUS_BADGE[r.status] || ''}`}
                >
                  {r.status}
                </span>
                <span className="text-xs text-kotoba-text/60">
                  {r.reference}
                </span>
                {r.is_trusted_flagger && (
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-900">
                    Trusted flagger
                  </span>
                )}
                <span className="text-xs text-kotoba-text/50 ml-auto">
                  {formatDateTime(r.created_at)}
                </span>
              </div>
              <p className="text-sm">
                <span className="font-semibold">Content:</span>{' '}
                <a
                  href={r.content_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-kotoba-primary underline break-all"
                >
                  {r.content_url}
                </a>
              </p>
              {r.legal_basis && (
                <p className="text-sm mt-1">
                  <span className="font-semibold">Legal basis:</span>{' '}
                  {r.legal_basis}
                </p>
              )}
              <p className="text-sm mt-2 whitespace-pre-wrap">
                <span className="font-semibold">Description:</span>{' '}
                {r.description}
              </p>
              <p className="text-xs text-kotoba-text/60 mt-2">
                Reporter: {r.reporter_email || '(anonymous)'} · IP: {r.ip || '?'}
                {r.acting_on_behalf_of
                  ? ` · On behalf of: ${r.acting_on_behalf_of}`
                  : ''}
              </p>
              {r.decision_reason && (
                <p className="text-xs text-kotoba-text/70 mt-2 bg-kotoba-background rounded-xl p-3">
                  <span className="font-semibold">Decision reason:</span>{' '}
                  {r.decision_reason}
                </p>
              )}
              {r.status === 'open' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => openPrompt(r, 'acknowledged')}
                    disabled={busyId === r.id}
                    className="px-3 py-1.5 rounded-md text-sm bg-sky-100 text-sky-900 hover:bg-sky-200"
                  >
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    onClick={() => openPrompt(r, 'actioned')}
                    disabled={busyId === r.id}
                    className="px-3 py-1.5 rounded-md text-sm bg-green-600 text-white hover:bg-green-700"
                  >
                    Action (remove / restrict)
                  </button>
                  <button
                    type="button"
                    onClick={() => openPrompt(r, 'dismissed')}
                    disabled={busyId === r.id}
                    className="px-3 py-1.5 rounded-md text-sm bg-gray-200 text-gray-800 hover:bg-gray-300"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <PromptModal
        open={promptState.open}
        title={`Mark report ${promptState.status}`}
        prompt="Statement of reasons (sent to the affected user under DSA Article 17):"
        confirmLabel={`Mark ${promptState.status}`}
        rows={4}
        onConfirm={submitResolution}
        onCancel={cancelPrompt}
      />
    </div>
  );
};

export default AdminReports;
