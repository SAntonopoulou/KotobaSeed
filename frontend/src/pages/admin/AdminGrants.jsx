import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useConfirm } from '../../context/ModalContext';
import { useToast } from '../../context/ToastContext';
import { SkeletonCard } from '../../components/Skeleton';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/dates';

// Admin → Comps & grants. Issue + revoke one-off service grants for
// marketing, contracts, internal testing.
//
// Kinds:
//   tier_upgrade  — give the user Plus/Pro/Business for X days or until revoked
//   minute_pack   — grant N classroom minutes to a tutor account
//   lesson_credit — grant N free 1:1 lessons that bypass Stripe checkout
//   discount      — generate a single-use Stripe Coupon on their next subscription
//
// Time-gated grants auto-expire via the daily cron; expiry reverses the
// side effect (e.g. restores prior tier, deletes untouched minute pack).

const KIND_LABEL = {
  tier_upgrade: 'Tier upgrade',
  minute_pack: 'Minute pack',
  lesson_credit: 'Lesson credits',
  discount: 'Subscription discount',
};

const STATUS_TONE = {
  active: 'bg-green-100 text-green-800',
  expired: 'bg-kotoba-text/10 text-kotoba-text/60',
  revoked: 'bg-amber-100 text-amber-900',
  consumed: 'bg-kotoba-primary/15 text-kotoba-primary',
};

const formatTime = (iso) => {
  if (!iso) return '—';
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
};

const summarisePayload = (kind, payload) => {
  if (!payload) return '';
  if (kind === 'tier_upgrade') return `Tier: ${payload.tier}`;
  if (kind === 'minute_pack') return `${payload.minutes?.toLocaleString?.() || payload.minutes} min`;
  if (kind === 'lesson_credit')
    return `${payload.count} lesson${payload.count === 1 ? '' : 's'}` +
      (payload.max_lesson_minutes ? ` · max ${payload.max_lesson_minutes} min` : '');
  if (kind === 'discount') {
    if (payload.percent_off != null) return `${payload.percent_off}% off`;
    if (payload.amount_off_cents != null)
      return `${(payload.amount_off_cents / 100).toFixed(2)} ${(payload.currency || 'eur').toUpperCase()} off`;
  }
  return '';
};

const AdminGrants = () => {
  const confirm = useConfirm();
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({
    target_email: '',
    kind: 'tier_upgrade',
    tier: 'pro',
    minutes: 1000,
    count: 1,
    max_lesson_minutes: 60,
    discount_type: 'percent',
    percent_off: 50,
    amount_off_cents: 1000,
    currency: 'eur',
    expires_at: '',
    reason: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/grants', {
        params: filter === 'all' ? {} : { status_filter: filter },
      });
      setRows(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load grants.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.target_email.trim()) {
      addToast('Enter the target user email.', 'error');
      return;
    }
    const payload = {};
    if (form.kind === 'tier_upgrade') {
      payload.tier = form.tier;
    } else if (form.kind === 'minute_pack') {
      payload.minutes = parseInt(form.minutes, 10) || 0;
    } else if (form.kind === 'lesson_credit') {
      payload.count = parseInt(form.count, 10) || 0;
      if (form.max_lesson_minutes) {
        payload.max_lesson_minutes = parseInt(form.max_lesson_minutes, 10);
      }
    } else if (form.kind === 'discount') {
      if (form.discount_type === 'percent') {
        payload.percent_off = parseFloat(form.percent_off);
      } else {
        payload.amount_off_cents = parseInt(form.amount_off_cents, 10);
        payload.currency = form.currency;
      }
    }
    const body = {
      target_email: form.target_email.trim().toLowerCase(),
      kind: form.kind,
      payload,
      reason: form.reason.trim() || null,
      expires_at: form.expires_at
        ? new Date(form.expires_at).toISOString()
        : null,
    };
    setBusy('create');
    try {
      await client.post('/admin/grants', body);
      addToast('Grant created and activated.', 'success');
      setShowForm(false);
      setForm({ ...form, target_email: '', reason: '' });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not create.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (row) => {
    if (
      !(await confirm({
        title: 'Revoke grant',
        message:
          `Revoke ${KIND_LABEL[row.kind]} for ${row.target_email}? ` +
          'Side effects will be reversed immediately.',
        confirmText: 'Revoke',
        destructive: true,
      }))
    )
      return;
    setBusy(`revoke-${row.id}`);
    try {
      await client.post(`/admin/grants/${row.id}/revoke`);
      addToast('Revoked.', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not revoke.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-kotoba-text">Comps &amp; grants</h1>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Issue one-off service grants for marketing, contracts, or internal testing.
            Time-gated grants auto-expire daily; revoke any time to reverse the side
            effects.
          </p>
        </div>
        <Link to="/admin/dashboard" className="text-sm text-kotoba-text/70 hover:text-kotoba-primary">
          ← Admin home
        </Link>
      </header>

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm"
          >
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
            <option value="consumed">Consumed</option>
            <option value="all">All</option>
          </select>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
            >
              + New grant
            </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={submit}
            className="border border-kotoba-text/15 rounded-lg p-4 bg-kotoba-background/20 space-y-3"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Target user email</label>
                <input
                  type="email"
                  value={form.target_email}
                  onChange={(e) => setForm({ ...form, target_email: e.target.value })}
                  className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Kind</label>
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
                >
                  <option value="tier_upgrade">Tier upgrade</option>
                  <option value="minute_pack">Minute pack</option>
                  <option value="lesson_credit">Lesson credits</option>
                  <option value="discount">Subscription discount</option>
                </select>
              </div>
            </div>

            {form.kind === 'tier_upgrade' && (
              <div>
                <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Tier</label>
                <select
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value })}
                  className="px-3 py-2 border border-kotoba-text/20 rounded text-sm"
                >
                  <option value="plus">Plus</option>
                  <option value="pro">Pro</option>
                  <option value="business">Business</option>
                </select>
              </div>
            )}

            {form.kind === 'minute_pack' && (
              <div>
                <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Minutes</label>
                <input
                  type="number"
                  min={1}
                  value={form.minutes}
                  onChange={(e) => setForm({ ...form, minutes: e.target.value })}
                  className="px-3 py-2 border border-kotoba-text/20 rounded text-sm w-32"
                />
              </div>
            )}

            {form.kind === 'lesson_credit' && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Free lessons</label>
                  <input
                    type="number"
                    min={1}
                    value={form.count}
                    onChange={(e) => setForm({ ...form, count: e.target.value })}
                    className="px-3 py-2 border border-kotoba-text/20 rounded text-sm w-32"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Max lesson minutes (optional)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.max_lesson_minutes}
                    onChange={(e) => setForm({ ...form, max_lesson_minutes: e.target.value })}
                    className="px-3 py-2 border border-kotoba-text/20 rounded text-sm w-32"
                  />
                </div>
              </div>
            )}

            {form.kind === 'discount' && (
              <div className="space-y-2">
                <div className="flex gap-3 items-center">
                  <label className="text-sm">
                    <input
                      type="radio"
                      checked={form.discount_type === 'percent'}
                      onChange={() => setForm({ ...form, discount_type: 'percent' })}
                      className="mr-1"
                    />
                    Percent off
                  </label>
                  <label className="text-sm">
                    <input
                      type="radio"
                      checked={form.discount_type === 'amount'}
                      onChange={() => setForm({ ...form, discount_type: 'amount' })}
                      className="mr-1"
                    />
                    Fixed amount off
                  </label>
                </div>
                {form.discount_type === 'percent' ? (
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={0.01}
                    value={form.percent_off}
                    onChange={(e) => setForm({ ...form, percent_off: e.target.value })}
                    className="px-3 py-2 border border-kotoba-text/20 rounded text-sm w-32"
                  />
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={1}
                      value={form.amount_off_cents}
                      onChange={(e) => setForm({ ...form, amount_off_cents: e.target.value })}
                      className="px-3 py-2 border border-kotoba-text/20 rounded text-sm w-32"
                    />
                    <span className="text-xs text-kotoba-text/60">cents</span>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      className="px-3 py-2 border border-kotoba-text/20 rounded text-sm"
                    >
                      <option value="eur">EUR</option>
                      <option value="usd">USD</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Expires at (optional)</label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
                />
                <p className="text-xs text-kotoba-text/60 mt-1">
                  Leave blank to keep active until you manually revoke.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Reason / audit note</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
                  placeholder="Campaign name, contract id, etc."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-kotoba-text/10">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-kotoba-text/60 hover:text-kotoba-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === 'create'}
                className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
              >
                {busy === 'create' ? 'Creating…' : 'Issue grant'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <SkeletonCard />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
            No grants in this state.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-kotoba-text/10">
              <thead className="bg-kotoba-background/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase">Target</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase">Kind</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase">Payload</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase">Expires</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-kotoba-text/60 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-kotoba-text/10">
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 text-sm text-kotoba-text">{row.target_email}</td>
                    <td className="px-4 py-2 text-sm text-kotoba-text">
                      {KIND_LABEL[row.kind] || row.kind}
                      {row.reason && (
                        <p className="text-xs text-kotoba-text/60 mt-0.5 italic truncate max-w-[14rem]">
                          {row.reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-kotoba-text/70">
                      {summarisePayload(row.kind, row.payload)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          STATUS_TONE[row.status] || 'bg-kotoba-text/10 text-kotoba-text/70'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-kotoba-text/60">
                      {formatTime(row.expires_at)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => revoke(row)}
                          disabled={busy === `revoke-${row.id}`}
                          className="text-sm text-red-600 hover:underline disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminGrants;
