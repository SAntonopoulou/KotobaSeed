import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useToast } from '../context/ToastContext';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

// Per-tenant classroom-minute usage vs. the tutor's plan cap. We surface
// this at the top of the bookings section so a tutor sees the meter every
// time they check on lessons. `quota_minutes === 0` means unlimited.

const PLAN_LABEL = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  business: 'Business',
};

const formatReset = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
};

const MinuteUsageCard = () => {
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [usage, packs] = await Promise.all([
          client.get('/tutor/me/minute-usage'),
          client.get('/tutor/minute-packs').catch(() => ({ data: { catalog: [] } })),
        ]);
        if (!cancelled) {
          setData(usage.data);
          setCatalog(packs.data?.catalog || []);
        }
      } catch {
        // 401/403 — tutor not signed in or not owner. Card just hides itself.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buyPack = async (sku) => {
    setBusy(sku);
    try {
      const res = await client.post('/tutor/minute-packs/checkout', { sku });
      window.location.href = res.data.checkout_url;
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not start checkout.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <SkeletonCard />;
  if (!data) return null;

  const unlimited = data.quota_minutes === 0;
  const used = data.used_minutes;
  const reserved = data.reserved_minutes ?? 0;
  const quota = data.quota_minutes;
  const percent = unlimited ? 0 : Math.min(100, data.percent_used);
  const percentReserved = unlimited
    ? 0
    : Math.min(100, data.percent_reserved ?? percent);
  const isWarn = !unlimited && percentReserved >= 80 && percentReserved < 100;
  const isOver = data.over_quota;

  const barColor = isOver
    ? 'bg-red-500'
    : isWarn
    ? 'bg-amber-500'
    : 'bg-kotoba-primary';
  // Reserved (upcoming) bookings sit behind the solid "used" bar in a
  // lighter tone so the tutor sees both: what's already taught + what's
  // still coming. Sophia called this out: "show potential as a different
  // colour in the bar, but used should be actual number."
  const reservedTone = isOver
    ? 'bg-red-300/60'
    : isWarn
    ? 'bg-amber-300/60'
    : 'bg-kotoba-primary/30';
  const textTone = isOver
    ? 'text-red-700'
    : isWarn
    ? 'text-amber-700'
    : 'text-kotoba-text';

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-kotoba-primary">Classroom minutes</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Live lesson minutes used this month. Resets {formatReset(data.next_reset_at)}.
          </p>
        </div>
        <span className="px-3 py-1 rounded-md bg-kotoba-secondary/30 text-kotoba-text text-sm font-medium">
          {PLAN_LABEL[data.plan] || data.plan} plan
        </span>
      </div>

      {unlimited ? (
        <p className={`text-base font-semibold ${textTone}`}>
          {used.toLocaleString()} min used · {reserved.toLocaleString()} min
          reserved · unlimited on Business.
        </p>
      ) : (
        <>
          <div className={`text-base font-semibold ${textTone}`}>
            {used.toLocaleString()} used
            {reserved > 0 && (
              <>
                {' '}+ {reserved.toLocaleString()} reserved
              </>
            )}
            {' '}/ {quota.toLocaleString()} min · {percent}%
            {reserved > 0 && percent !== percentReserved && (
              <span className="ml-1 text-sm font-normal text-kotoba-text/60">
                ({percentReserved}% with upcoming)
              </span>
            )}
          </div>
          <div className="relative w-full h-2 rounded-full bg-kotoba-background overflow-hidden">
            {/* Reserved (upcoming) sits in the lighter tone behind the
                solid used bar — the eye sees them stacked. */}
            <div
              className={`absolute inset-y-0 left-0 ${reservedTone} transition-all duration-500`}
              style={{ width: `${Math.max(2, percentReserved)}%` }}
              aria-hidden="true"
            />
            <div
              className={`relative h-full ${barColor} transition-all duration-500`}
              style={{ width: `${Math.max(2, percent)}%` }}
              aria-label={`${percent}% used, ${percentReserved}% including upcoming reservations`}
            />
          </div>
          {data.pack_minutes_available > 0 && (
            <p className="text-sm text-kotoba-text/70">
              Plus <strong>{data.pack_minutes_available.toLocaleString()}</strong> extra
              minutes from top-up packs.
            </p>
          )}
        </>
      )}

      {isOver && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
          You've hit this month's classroom minutes. New bookings will be turned away until the cap resets.{' '}
          <Link to="/dashboard#money" className="font-semibold underline">
            Upgrade your plan
          </Link>{' '}
          to keep accepting lessons.
        </div>
      )}
      {!isOver && isWarn && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-md text-sm">
          You're close to this month's cap. Once you hit it, new bookings are turned away.{' '}
          <Link to="/dashboard#money" className="font-semibold underline">
            Upgrade
          </Link>{' '}
          or top up below to keep accepting lessons.
        </div>
      )}

      {!unlimited && catalog.length > 0 && (isOver || isWarn || showPicker) && (
        <div className="border-t border-kotoba-text/10 pt-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold text-kotoba-text">Add more minutes</p>
            {!showPicker && (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="text-xs text-kotoba-primary hover:underline"
              >
                Hide
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {catalog.map((pack) => (
              <button
                key={pack.sku}
                type="button"
                onClick={() => buyPack(pack.sku)}
                disabled={busy === pack.sku}
                className="text-left p-3 rounded-md border border-kotoba-text/10 hover:border-kotoba-primary hover:bg-kotoba-primary/5 disabled:opacity-50"
              >
                <p className="font-semibold text-kotoba-primary">
                  {pack.minutes.toLocaleString()} min
                </p>
                <p className="text-xs text-kotoba-text/60">
                  €{(pack.price_cents / 100).toFixed(2)} · never expires
                </p>
                {busy === pack.sku && (
                  <p className="text-xs text-kotoba-text/60 mt-1">Opening checkout…</p>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-kotoba-text/50">
            One-time purchase. Minutes carry over month to month until used.
          </p>
        </div>
      )}

      {!unlimited && catalog.length > 0 && !isOver && !isWarn && !showPicker && (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="text-sm text-kotoba-primary hover:underline"
        >
          Need more minutes? Add a top-up pack →
        </button>
      )}
    </section>
  );
};

export default MinuteUsageCard;
