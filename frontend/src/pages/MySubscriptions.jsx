import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { useReveal } from '../hooks/landingAnimations';
import { getErrorMessage } from '../utils/errors';

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
  active: 'bg-kotoba-primary/15 text-kotoba-primary border-kotoba-primary/20',
  past_due: 'bg-kotoba-secondary/30 text-kotoba-text border-kotoba-secondary/40',
  cancelled: 'bg-kotoba-text/10 text-kotoba-text/60 border-kotoba-text/15',
  unpaid: 'bg-red-100 text-red-700 border-red-200',
};

const STATUS_LABEL = {
  active: 'Active',
  past_due: 'Past due',
  cancelled: 'Cancelled',
  unpaid: 'Unpaid',
};

const RevealBlock = ({ children, delay = 0 }) => {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={`v2-reveal ${visible ? 'is-revealed' : ''}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
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
      setError(getErrorMessage(err, 'Could not load your subscriptions.'));
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
      setError(getErrorMessage(err, 'Could not cancel.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-6">
        <RevealBlock>
          <header>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              Your billing
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
              My subscriptions
            </h1>
            <p className="mt-4 text-base text-kotoba-text/75 leading-relaxed">
              Active subscriptions unlock every premium module + homework from that tutor.
            </p>
          </header>
        </RevealBlock>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="bg-kotoba-primary/10 border border-kotoba-primary/20 text-kotoba-primary px-4 py-3 rounded-2xl text-sm">
            {info}
          </div>
        )}

        {loading ? (
          <p className="text-kotoba-text/60">Loading…</p>
        ) : subs.length === 0 ? (
          <RevealBlock>
            <div className="bg-white rounded-3xl shadow-soft p-10 text-center">
              <p className="text-kotoba-text/70 leading-relaxed">
                You're not subscribed to any tutors yet. Visit a tutor's site and look for their subscription banner on the modules page.
              </p>
            </div>
          </RevealBlock>
        ) : (
          <ul className="space-y-3">
            {subs.map((s, i) => (
              <RevealBlock key={s.id} delay={i * 60}>
                <li className="bg-white rounded-3xl shadow-soft p-6 hover:shadow-soft-lg transition-shadow duration-300">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-bold text-kotoba-primary leading-tight">
                        {s.tutor_display_name || `Tutor #${s.tutor_id}`}
                      </p>
                      <p className="mt-1.5 text-sm text-kotoba-text/70">
                        <span className="font-semibold text-kotoba-text tabular-nums">
                          {formatPrice(s.price_cents, s.currency)}
                        </span>
                        <span> /month · started {formatDate(s.started_at)}</span>
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.14em] font-bold border ${STATUS_TONE[s.status] || STATUS_TONE.unpaid}`}>
                      {STATUS_LABEL[s.status] || s.status}
                    </span>
                  </div>
                  <p className="text-sm text-kotoba-text/70 mt-3">
                    {s.cancel_at_period_end
                      ? `Cancelled — access ends ${formatDate(s.current_period_end)}`
                      : `Next renewal: ${formatDate(s.current_period_end)}`}
                  </p>
                  {s.status === 'active' && !s.cancel_at_period_end && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => cancel(s)}
                        disabled={busy === s.id}
                        className="text-sm text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                      >
                        {busy === s.id ? 'Cancelling…' : 'Cancel at period end'}
                      </button>
                    </div>
                  )}
                </li>
              </RevealBlock>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default MySubscriptions;
