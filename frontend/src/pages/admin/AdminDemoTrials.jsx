import React, { useCallback, useEffect, useState } from 'react';
import client from '../../api/client';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/dates';
import { getErrorMessage } from '../../utils/errors';

// Manage classroom trial accounts. Sophia (or future support) creates
// a short-lived sandbox user for someone who wants to try the live
// classroom before signing up. The trial has a hard minute cap so a
// curious prospect can't burn through our Daily.co spend.

const AdminDemoTrials = () => {
  const { addToast } = useToast();
  const [trials, setTrials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ minutes: 10, label: '', period: 'total', months: 1 });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/demo-trials');
      setTrials(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load demo trials.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await client.post('/admin/demo-trials', {
        minutes: Number(form.minutes),
        label: form.label.trim() || null,
        period: form.period,
        months: Number(form.months),
      });
      setCreated(res.data);
      setForm({ minutes: 10, label: '', period: 'total', months: 1 });
      load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not create trial.'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await client.delete(`/admin/demo-trials/${id}`);
      addToast('Trial removed.', 'success');
      load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not delete trial.'), 'error');
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    addToast('Copied.', 'info');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-kotoba-primary">Classroom trial accounts</h1>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Hand-issued sandbox accounts for prospects who want to feel the live classroom before committing. Each has a hard minute cap and auto-expires after 7 days. Delete sooner if you need to.
        </p>
      </header>

      <form onSubmit={create} className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-kotoba-text">Create a new trial</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="minutes" className="block text-sm font-medium text-kotoba-text/80">
              Classroom minutes
            </label>
            <input
              id="minutes"
              name="minutes"
              type="number"
              min="1"
              max="60"
              required
              value={form.minutes}
              onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))}
              className="mt-1 block w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
            />
            <p className="mt-1 text-xs text-kotoba-text/60">
              {form.period === 'monthly'
                ? 'Refills every 30 days while the trial is active.'
                : 'One-shot cap. 5–10 is a sensible default.'}
            </p>
          </div>
          <div>
            <label htmlFor="label" className="block text-sm font-medium text-kotoba-text/80">
              Label (for your records)
            </label>
            <input
              id="label"
              name="label"
              type="text"
              maxLength={120}
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Maria — Greek school chain prospect"
              className="mt-1 block w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
            />
          </div>
          <div>
            <label htmlFor="period" className="block text-sm font-medium text-kotoba-text/80">
              Period
            </label>
            <select
              id="period"
              name="period"
              value={form.period}
              onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
              className="mt-1 block w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
            >
              <option value="total">Total (one-shot, expires in 7 days)</option>
              <option value="monthly">Monthly (refills every 30 days)</option>
            </select>
          </div>
          {form.period === 'monthly' && (
            <div>
              <label htmlFor="months" className="block text-sm font-medium text-kotoba-text/80">
                Active for (months)
              </label>
              <select
                id="months"
                name="months"
                value={form.months}
                onChange={(e) => setForm((f) => ({ ...f, months: e.target.value }))}
                className="mt-1 block w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>{m} {m === 1 ? 'month' : 'months'}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-kotoba-text/60">
                Trial expires entirely after this. Minutes refill on the 30-day mark.
              </p>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={creating}
          className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create trial account'}
        </button>
      </form>

      {created && (
        <div className="rounded-lg shadow-lg p-6 border-2 border-kotoba-primary bg-kotoba-primary/5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-primary">
                Created — copy these now
              </p>
              <p className="text-sm text-kotoba-text/70 mt-1">
                The password is shown only once. Share these with the prospect; they expire {formatDateTime(created.expires_at)}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="text-sm text-kotoba-text/60 hover:text-kotoba-text"
            >
              Dismiss
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm font-mono">
            <button
              type="button"
              onClick={() => copy(created.email)}
              className="text-left p-3 rounded bg-white border border-kotoba-text/10 hover:border-kotoba-primary"
            >
              <p className="text-xs text-kotoba-text/60 mb-1 font-sans">Email (click to copy)</p>
              {created.email}
            </button>
            <button
              type="button"
              onClick={() => copy(created.password)}
              className="text-left p-3 rounded bg-white border border-kotoba-text/10 hover:border-kotoba-primary"
            >
              <p className="text-xs text-kotoba-text/60 mb-1 font-sans">Password (click to copy)</p>
              {created.password}
            </button>
          </div>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-kotoba-text mb-3">Active trials</h2>
        {loading ? (
          <p className="text-kotoba-text/60">Loading…</p>
        ) : trials.length === 0 ? (
          <p className="text-kotoba-text/60">No active trials.</p>
        ) : (
          <div className="space-y-2">
            {trials.map((t) => (
              <div key={t.id} className="bg-white rounded-lg shadow-sm p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-kotoba-text">{t.label || '(unlabelled)'}</p>
                    <span
                      className={
                        'text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded ' +
                        (t.period === 'monthly'
                          ? 'bg-kotoba-primary/10 text-kotoba-primary'
                          : 'bg-kotoba-text/10 text-kotoba-text/70')
                      }
                    >
                      {t.period === 'monthly' ? 'Monthly' : 'One-shot'}
                    </span>
                  </div>
                  <p className="text-xs text-kotoba-text/60 font-mono truncate">{t.email}</p>
                  <p className="text-xs text-kotoba-text/60 mt-2">
                    <strong>{t.minutes_remaining}</strong>
                    {t.period === 'monthly' && t.minutes_allocated
                      ? ` / ${t.minutes_allocated} min this cycle`
                      : ' min left'}
                    {' · expires '}
                    {formatDateTime(t.expires_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(t)}
                  className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        title="Delete trial account"
        message={
          deleteTarget
            ? `Delete trial "${deleteTarget.label || deleteTarget.email}"? They'll be signed out immediately.`
            : ''
        }
        confirmText="Delete"
        isDanger
      />
    </div>
  );
};

export default AdminDemoTrials;
