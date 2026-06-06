import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';

const formatPrice = (cents, currency = 'eur') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'eur').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
};

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return iso;
  }
};

const STATUS_TONE = {
  active: 'bg-kotoba-primary/15 text-kotoba-primary',
  past_due: 'bg-kotoba-secondary/30 text-kotoba-text',
  cancelled: 'bg-kotoba-text/10 text-kotoba-text/60',
  unpaid: 'bg-red-100 text-red-700',
};

const STATUS_LABEL = {
  active: 'Active',
  past_due: 'Past due',
  cancelled: 'Cancelled',
  unpaid: 'Unpaid',
};

const MySubscriptions = () => {
  const confirm = useConfirm();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/users/me/subscriptions/tutors');
      setSubs(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load your subscriptions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cancel = async (sub) => {
    if (!(await confirm({
      title: 'Cancel subscription',
      message: `Cancel your subscription to ${sub.tutor_display_name}? You keep access through ${formatDate(sub.current_period_end)}.`,
      confirmText: 'Cancel subscription',
      destructive: true,
    }))) return;
    setBusy(sub.id);
    setError('');
    setInfo('');
    try {
      await client.post(`/users/me/subscriptions/tutors/${sub.id}/cancel`);
      setInfo('Cancelled — you keep access through the end of the period.');
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not cancel.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-kotoba-background min-h-screen">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <header>
          <h1 className="text-3xl font-extrabold text-kotoba-primary">My tutor subscriptions</h1>
          <p className="mt-2 text-kotoba-text/80">
            Active subscriptions unlock every premium module + homework from that tutor.
          </p>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm">
            {info}
          </div>
        )}

        {loading ? (
          <p className="text-kotoba-text">Loading…</p>
        ) : subs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-kotoba-text/70">
              You're not subscribed to any tutors yet. Visit a tutor's site and look for their subscription banner on the modules page.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {subs.map((s) => (
              <li key={s.id} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-kotoba-primary">
                      {s.tutor_display_name || `Tutor #${s.tutor_id}`}
                    </p>
                    <p className="text-sm text-kotoba-text/70">
                      {formatPrice(s.price_cents, s.currency)}/month · started {formatDate(s.started_at)}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_TONE[s.status] || STATUS_TONE.unpaid}`}>
                    {STATUS_LABEL[s.status] || s.status}
                  </span>
                </div>
                <p className="text-sm text-kotoba-text/70 mt-2">
                  {s.cancel_at_period_end
                    ? `Cancelled — access ends ${formatDate(s.current_period_end)}`
                    : `Next renewal: ${formatDate(s.current_period_end)}`}
                </p>
                {s.status === 'active' && !s.cancel_at_period_end && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => cancel(s)}
                      disabled={busy === s.id}
                      className="text-sm text-red-600 hover:underline disabled:opacity-50"
                    >
                      {busy === s.id ? 'Cancelling…' : 'Cancel at period end'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default MySubscriptions;
