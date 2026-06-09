import React, { useCallback, useEffect, useState } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/dates';
import { getErrorMessage } from '../../utils/errors';

// Admin surface for publishing + retracting platform-wide announcement
// banners. Severity=policy_change drives the EU P2B Article 8 15-day
// notice flow: the AnnouncementBanner component shows it to every
// affected tutor with an "I've read this" CTA that records the legal
// proof-of-notice.

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info', description: 'Light blue banner. Dismissible.' },
  { value: 'policy_change', label: 'Policy change (P2B 15-day notice)', description: 'Amber. Requires acknowledge. Use for T&C / pricing / commission changes.' },
  { value: 'security', label: 'Security', description: 'Red. Use for security incidents or urgent account actions.' },
];

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'Everyone' },
  { value: 'tutors_only', label: 'Tutors only' },
  { value: 'students_only', label: 'Students only' },
];

const blankDraft = () => ({
  title: '',
  body_md: '',
  audience: 'all',
  severity: 'info',
  publish_at: '',
  effective_at: '',
  cta_label: '',
  cta_url: '',
  dismissible: true,
});

const toIsoOrNull = (local) => {
  if (!local) return null;
  // <input type="datetime-local"> gives "YYYY-MM-DDTHH:mm" in local TZ.
  // Send as full ISO so the backend parses it correctly.
  try {
    return new Date(local).toISOString();
  } catch {
    return null;
  }
};

const AdminAnnouncements = () => {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(blankDraft());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/announcements');
      setRows(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load announcements.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.title.trim() || draft.body_md.trim().length < 10) {
      addToast('Title and a meaningful body are required.', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: draft.title,
        body_md: draft.body_md,
        audience: draft.audience,
        severity: draft.severity,
        publish_at: toIsoOrNull(draft.publish_at),
        effective_at: toIsoOrNull(draft.effective_at),
        cta_label: draft.cta_label || null,
        cta_url: draft.cta_url || null,
        dismissible: draft.dismissible,
      };
      await client.post('/admin/announcements', payload);
      addToast('Announcement published.', 'success');
      setDraft(blankDraft());
      load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not publish.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const retract = async (row) => {
    if (!window.confirm(`Retract "${row.title}"? It'll disappear for anyone who hasn't dismissed it yet.`)) {
      return;
    }
    try {
      await client.post(`/admin/announcements/${row.id}/retract`);
      addToast('Retracted.', 'success');
      load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not retract.'), 'error');
    }
  };

  // P2B 15-day notice helper: if severity=policy_change and effective_at
  // is set, warn when publish_at -> effective_at is less than 15 days.
  let p2bWarning = '';
  if (
    draft.severity === 'policy_change'
    && (draft.audience === 'all' || draft.audience === 'tutors_only')
    && draft.effective_at
  ) {
    const pub = draft.publish_at ? new Date(draft.publish_at) : new Date();
    const eff = new Date(draft.effective_at);
    const days = (eff - pub) / (1000 * 60 * 60 * 24);
    if (days < 15) {
      p2bWarning = `Heads up: this is a tutor-facing policy_change with only ${days.toFixed(1)} days notice. EU P2B Article 8 normally requires 15 days. Publishing anyway will log a warning to the audit trail.`;
    }
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-kotoba-primary">Announcements</h1>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Publish a platform-wide banner. Use <code>policy_change</code> + an{' '}
          <code>effective_at</code> at least 15 days out for tutor-facing T&C changes (EU P2B Article 8).
        </p>
      </div>

      <form
        onSubmit={submit}
        className="bg-white rounded-2xl border border-kotoba-text/10 p-6 space-y-4 shadow-sm"
      >
        <h2 className="text-lg font-bold text-kotoba-primary">New announcement</h2>

        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            Title
          </label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            maxLength={200}
            required
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            Body (markdown is fine for now — rendered as plain text in the banner)
          </label>
          <textarea
            rows={5}
            value={draft.body_md}
            onChange={(e) =>
              setDraft((d) => ({ ...d, body_md: e.target.value }))
            }
            maxLength={10000}
            required
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
              Audience
            </label>
            <select
              value={draft.audience}
              onChange={(e) =>
                setDraft((d) => ({ ...d, audience: e.target.value }))
              }
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            >
              {AUDIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
              Severity
            </label>
            <select
              value={draft.severity}
              onChange={(e) =>
                setDraft((d) => ({ ...d, severity: e.target.value }))
              }
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-kotoba-text/60">
              {SEVERITY_OPTIONS.find((s) => s.value === draft.severity)?.description}
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
              Publish at (optional — defaults to now)
            </label>
            <input
              type="datetime-local"
              value={draft.publish_at}
              onChange={(e) =>
                setDraft((d) => ({ ...d, publish_at: e.target.value }))
              }
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
              Effective at (optional — when the change takes effect)
            </label>
            <input
              type="datetime-local"
              value={draft.effective_at}
              onChange={(e) =>
                setDraft((d) => ({ ...d, effective_at: e.target.value }))
              }
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
              CTA label (optional)
            </label>
            <input
              type="text"
              value={draft.cta_label}
              onChange={(e) =>
                setDraft((d) => ({ ...d, cta_label: e.target.value }))
              }
              maxLength={80}
              placeholder="Read the policy"
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
              CTA URL (optional)
            </label>
            <input
              type="text"
              value={draft.cta_url}
              onChange={(e) =>
                setDraft((d) => ({ ...d, cta_url: e.target.value }))
              }
              maxLength={512}
              placeholder="/legal/tutor-agreement"
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.dismissible}
            onChange={(e) =>
              setDraft((d) => ({ ...d, dismissible: e.target.checked }))
            }
            className="mt-1"
          />
          <span>Allow users to dismiss this banner.</span>
        </label>

        {p2bWarning && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm">
            {p2bWarning}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
          >
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </form>

      <div>
        <h2 className="text-lg font-bold text-kotoba-primary mb-3">All announcements</h2>
        {loading ? (
          <p className="text-kotoba-text/60">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-kotoba-text/60 bg-white rounded-2xl border border-kotoba-text/10 p-6 text-center">
            No announcements yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((a) => (
              <li
                key={a.id}
                className={`bg-white rounded-2xl border border-kotoba-text/10 p-5 ${
                  a.is_retracted ? 'opacity-60' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-kotoba-background">
                    {a.severity}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-kotoba-background">
                    {a.audience}
                  </span>
                  {a.is_retracted && (
                    <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                      Retracted
                    </span>
                  )}
                  <span className="text-xs text-kotoba-text/50 ml-auto">
                    Published {formatDateTime(a.publish_at)}
                  </span>
                </div>
                <p className="font-semibold">{a.title}</p>
                <p className="text-sm whitespace-pre-wrap mt-1">{a.body_md}</p>
                {a.effective_at && (
                  <p className="text-xs text-kotoba-text/60 mt-2">
                    Effective: {formatDateTime(a.effective_at)}
                  </p>
                )}
                {!a.is_retracted && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => retract(a)}
                      className="px-3 py-1.5 rounded-md text-sm bg-gray-200 text-gray-800 hover:bg-gray-300"
                    >
                      Retract
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminAnnouncements;
