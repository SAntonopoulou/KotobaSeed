import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Business summary panel — first thing the tutor sees on their dashboard.
// Three metric clusters: this month, lifetime, upcoming. Plus a six-month
// revenue bar chart so the tutor can see momentum at a glance.

const formatPrice = (cents, currency = 'eur') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'eur').toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `€${Math.round(cents / 100)}`;
  }
};

const formatMonth = (iso) => {
  const [y, m] = iso.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString(undefined, { month: 'short' });
};

const formatRate = (rate) => {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
};

const Metric = ({ label, value, hint }) => (
  <div className="bg-kotoba-background/40 rounded-lg p-3">
    <p className="text-xs uppercase tracking-wider text-kotoba-text/60 font-medium">{label}</p>
    <p className="mt-1 text-2xl font-extrabold text-kotoba-primary">{value}</p>
    {hint && <p className="mt-1 text-xs text-kotoba-text/60">{hint}</p>}
  </div>
);

const TutorAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/tutor/analytics');
        setData(res.data);
      } catch (err) {
        setError(err?.response?.data?.detail || 'Could not load analytics.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Your business</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Your business</h2>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      </section>
    );
  }

  const { current_month, lifetime, upcoming, monthly_trend } = data;
  const maxRevenue = Math.max(1, ...monthly_trend.map((p) => p.revenue_cents));
  const totalSixMonth = monthly_trend.reduce((sum, p) => sum + p.revenue_cents, 0);
  const totalLessonsSixMonth = monthly_trend.reduce((sum, p) => sum + p.lessons, 0);

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-lg font-bold text-kotoba-primary">Your business</h2>
        <span className="text-xs text-kotoba-text/60">{current_month.month_label}</span>
      </div>

      {/* This month — the headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Metric
          label="Revenue this month"
          value={formatPrice(current_month.revenue_cents, current_month.currency)}
          hint="After platform fees"
        />
        <Metric
          label="Lessons taught"
          value={current_month.lessons_completed}
          hint={`${current_month.hours_taught} hours`}
        />
        <Metric
          label="New students"
          value={current_month.new_students}
          hint="First paid booking this month"
        />
        <Metric
          label="Upcoming"
          value={upcoming.confirmed_count}
          hint={`${upcoming.next_7_days} in the next 7 days`}
        />
      </div>

      {/* Lifetime metrics — secondary row */}
      <div className="grid grid-cols-3 gap-3 mb-5 text-center">
        <div className="border border-kotoba-text/10 rounded-lg p-3">
          <p className="text-xs uppercase tracking-wider text-kotoba-text/60">Total students</p>
          <p className="mt-1 text-xl font-bold text-kotoba-primary">{lifetime.total_students}</p>
        </div>
        <div className="border border-kotoba-text/10 rounded-lg p-3">
          <p className="text-xs uppercase tracking-wider text-kotoba-text/60">Repeat students</p>
          <p className="mt-1 text-xl font-bold text-kotoba-primary">{lifetime.repeat_students}</p>
          <p className="text-xs text-kotoba-text/60">
            {lifetime.total_students > 0
              ? `${Math.round((lifetime.repeat_students / lifetime.total_students) * 100)}% return`
              : 'No bookings yet'}
          </p>
        </div>
        <div className="border border-kotoba-text/10 rounded-lg p-3">
          <p className="text-xs uppercase tracking-wider text-kotoba-text/60">Trial → paid</p>
          <p className="mt-1 text-xl font-bold text-kotoba-primary">
            {formatRate(lifetime.trial_to_paid_conversion_rate)}
          </p>
          <p className="text-xs text-kotoba-text/60">conversion rate</p>
        </div>
      </div>

      {/* Six-month revenue trend — homegrown SVG-free bar chart */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-kotoba-text/80">Last 6 months</h3>
          <span className="text-xs text-kotoba-text/60">
            {formatPrice(totalSixMonth, current_month.currency)} · {totalLessonsSixMonth} lessons
          </span>
        </div>
        <div className="flex items-end justify-between gap-2 h-32">
          {monthly_trend.map((point) => {
            const heightPct = Math.round((point.revenue_cents / maxRevenue) * 100);
            const isCurrent = monthly_trend.indexOf(point) === monthly_trend.length - 1;
            return (
              <div
                key={point.month}
                className="flex flex-col items-center flex-grow"
                title={`${formatMonth(point.month)}: ${formatPrice(point.revenue_cents, current_month.currency)} · ${point.lessons} lessons`}
              >
                <div className="flex-grow flex items-end w-full px-1">
                  <div
                    className={`w-full rounded-t ${
                      isCurrent ? 'bg-kotoba-primary' : 'bg-kotoba-primary/40'
                    }`}
                    style={{ height: `${Math.max(2, heightPct)}%` }}
                  />
                </div>
                <p className="text-xs text-kotoba-text/70 mt-1">{formatMonth(point.month)}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-kotoba-text/60">
          Hover any bar for the month's revenue + lesson count.
        </p>
      </div>
    </section>
  );
};

export default TutorAnalytics;
