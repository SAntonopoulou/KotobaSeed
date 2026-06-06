import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { SkeletonCard } from './Skeleton';

// Single per-tutor recurring content subscription. The price field is
// in euros for the UI; we convert to cents at save time. Existing
// subscribers keep their original price (Stripe locks at signup), so
// changing this only affects new sign-ups.

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

const SubscriptionPlanManager = () => {
  const confirm = useConfirm();
  const [plan, setPlan] = useState(null);
  const [draftEuros, setDraftEuros] = useState('');
  const [draftCredits, setDraftCredits] = useState(0);
  const [draftRollover, setDraftRollover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/subscription-plan');
      setPlan(res.data);
      setDraftEuros(res.data.price_cents > 0 ? (res.data.price_cents / 100).toString() : '');
      setDraftCredits(res.data.monthly_grading_credits || 0);
      setDraftRollover(Boolean(res.data.credits_roll_over));
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load subscription plan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const cents = Math.round(parseFloat(draftEuros || '0') * 100);
    if (!Number.isFinite(cents) || cents < 100) {
      setError('Set a price of at least €1.00.');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await client.put('/tutor/subscription-plan', {
        price_cents: cents,
        is_active: true,
        monthly_grading_credits: Math.max(0, parseInt(draftCredits || '0', 10)),
        credits_roll_over: draftRollover,
      });
      setPlan(res.data);
      setInfo(plan?.is_active ? 'Updated. New subscribers will pay this price.' : 'Subscription is live.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!(await confirm({
      title: 'Pause subscription plan',
      message: 'Pause new sign-ups? Existing subscribers keep access until their next renewal fails.',
      confirmText: 'Pause',
    }))) return;
    setBusy(true);
    try {
      await client.delete('/tutor/subscription-plan');
      await load();
      setInfo('Subscription paused. Existing subscribers stay until period end.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not pause.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <SkeletonCard />;
  }

  const previewCents = Math.round(parseFloat(draftEuros || '0') * 100);
  const previewFee = plan?.fee_percent != null && previewCents > 0
    ? Math.round(previewCents * (plan.fee_percent / 100))
    : 0;

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Content subscription</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Offer subscribers monthly access to every premium module and premium homework you publish. We take {plan?.fee_percent ?? 10}% per renewal at your current tier — Business pays nothing. Existing subscribers keep their original price when you adjust this.
          </p>
        </div>
        {plan?.is_active && (
          <span className="px-3 py-1 rounded-md bg-kotoba-primary/15 text-kotoba-primary text-sm font-medium">
            Live · {formatPrice(plan.price_cents, plan.currency)}/mo
          </span>
        )}
      </div>

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

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            Monthly price (€)
          </label>
          <input
            type="number"
            step="0.01"
            min="1"
            value={draftEuros}
            onChange={(e) => setDraftEuros(e.target.value)}
            placeholder="15.00"
            disabled={busy}
            className="w-32 px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          {previewCents > 0 && plan?.fee_percent != null && (
            <p className="mt-1 text-xs text-kotoba-text/60">
              Platform fee at {plan.fee_percent}%: {formatPrice(previewFee)} · You receive {formatPrice(previewCents - previewFee)} per renewal
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-kotoba-text/10 pt-3">
        <p className="text-sm font-medium text-kotoba-text mb-1">Grading credits</p>
        <p className="text-xs text-kotoba-text/60 mb-2">
          How many free gradings each subscriber gets per month. Credits cover the per-grading fee on your homework templates. 0 = subscribers still pay per grading.
        </p>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-kotoba-text/70 mb-1">Credits / month</label>
            <input
              type="number"
              min="0"
              max="500"
              value={draftCredits}
              onChange={(e) => setDraftCredits(e.target.value)}
              disabled={busy}
              className="w-24 px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draftRollover}
              onChange={(e) => setDraftRollover(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded"
            />
            Unused credits roll over to the next month
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-kotoba-text/10">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : plan?.is_active ? 'Update plan' : 'Start offering subscription'}
        </button>
        {plan?.is_active && (
          <button
            type="button"
            onClick={deactivate}
            disabled={busy}
            className="px-4 py-2 text-sm text-red-600 hover:underline"
          >
            Pause new sign-ups
          </button>
        )}
      </div>
    </section>
  );
};

export default SubscriptionPlanManager;
