import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';

// Student's recurring lessons — list current plans + cancel.
// Plan creation happens on the tutor's site via BookingDialog where the
// student picks "Make this recurring" before checking out.

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const formatTime = (minutes) => {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m} UTC`;
};

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

const MyRecurringPlans = () => {
  const confirm = useConfirm();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/recurring/plans/mine');
      setPlans(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load your recurring plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cancel = async (plan) => {
    if (!(await confirm({
      title: 'Cancel recurring plan',
      message: `Cancel your recurring lesson with ${plan.tutor_display_name}? Already-scheduled lessons stay until you pay for them or they auto-cancel inside 48h of the lesson.`,
      confirmText: 'Cancel plan',
      destructive: true,
    }))) return;
    try {
      await client.post(`/recurring/plans/${plan.id}/cancel`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not cancel.');
    }
  };

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Recurring lessons</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  if (plans.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
      <h2 className="text-lg font-bold text-kotoba-primary">Recurring lessons</h2>
      <p className="text-sm text-kotoba-text/70">
        Standing weekly lessons. We auto-create the next 4 weeks of bookings; you pay for each individually before the lesson.
      </p>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
        {plans.map((p) => (
          <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-grow">
              <p className="font-medium text-kotoba-primary">
                {p.pack_name || 'Lesson'} with {p.tutor_display_name}
              </p>
              <p className="text-xs text-kotoba-text/60 mt-0.5">
                Every {DAY_NAMES[p.day_of_week]} at {formatTime(p.start_minute)} · {formatPrice(p.price_cents, p.currency)}/lesson · {p.upcoming_bookings} upcoming
                {p.status !== 'active' && <span className="ml-2 text-red-600">Cancelled</span>}
              </p>
            </div>
            {p.status === 'active' && (
              <button
                type="button"
                onClick={() => cancel(p)}
                className="text-sm text-red-600 hover:underline"
              >
                Cancel plan
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default MyRecurringPlans;
