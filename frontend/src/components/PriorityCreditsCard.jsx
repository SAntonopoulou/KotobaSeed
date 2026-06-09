import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Student-facing summary of priority credits — granted on Premium-tier
// subscription payments, spendable on Requests to jump the priority queue.
// Hidden completely when the student has no credit history at all so
// non-Premium users don't see an empty widget.

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return formatDateShort(iso);
  } catch {
    return iso;
  }
};

const PriorityCreditsCard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/users/me/priority-credits');
        if (!cancelled) setSummary(res.data);
      } catch {
        // Endpoint failure shouldn't break the dashboard.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!summary || (summary.available === 0 && summary.used === 0 && summary.expired === 0)) {
    return null;
  }

  // Earliest-expiring available credit drives the urgency hint.
  const nextExpiring = (summary.credits || [])
    .filter((c) => c.status === 'available')
    .sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at))[0];

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Priority credits</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Jump the priority queue when you create a request. Each credit lasts 30 days from when it was granted.
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold text-kotoba-primary">
            {summary.available}
          </p>
          <p className="text-xs text-kotoba-text/60 uppercase tracking-wider">
            available
          </p>
        </div>
      </div>

      {nextExpiring && (
        <p className="text-xs text-kotoba-text/60 mt-3">
          Next expires {formatDate(nextExpiring.expires_at)}.
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-kotoba-background/40 rounded p-2">
          <p className="font-bold text-kotoba-primary text-base">{summary.available}</p>
          <p className="text-kotoba-text/60">Available</p>
        </div>
        <div className="bg-kotoba-background/40 rounded p-2">
          <p className="font-bold text-kotoba-text text-base">{summary.used}</p>
          <p className="text-kotoba-text/60">Used</p>
        </div>
        <div className="bg-kotoba-background/40 rounded p-2">
          <p className="font-bold text-kotoba-text/60 text-base">{summary.expired}</p>
          <p className="text-kotoba-text/60">Expired</p>
        </div>
      </div>
    </section>
  );
};

export default PriorityCreditsCard;
