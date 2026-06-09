import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

// How far ahead a student has to book a slot.
// 0 = "any time, even one minute from now"; up to 30 days.
// Presets cover the common cases; the custom input handles anything in
// between (in minutes — converting to a friendly label below).

const PRESETS = [
  { label: 'No lead time', minutes: 0 },
  { label: '30 minutes', minutes: 30 },
  { label: '2 hours (default)', minutes: 120 },
  { label: '24 hours', minutes: 1440 },
  { label: '3 days', minutes: 4320 },
];

const friendly = (m) => {
  if (m === 0) return 'no minimum';
  if (m < 60) return `${m} min`;
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'}`;
  if (m % 60 === 0) return `${m / 60} hours`;
  return `${m} min`;
};

const BookingLeadTimePolicy = () => {
  const [minutes, setMinutes] = useState(120);
  const [savedMinutes, setSavedMinutes] = useState(120);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/me');
      const m = res.data?.min_booking_lead_minutes ?? 120;
      setMinutes(m);
      setSavedMinutes(m);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your policy.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (next) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const res = await client.patch('/tutor/me', {
        min_booking_lead_minutes: next,
      });
      const m = res.data?.min_booking_lead_minutes ?? next;
      setMinutes(m);
      setSavedMinutes(m);
      setInfo('Saved.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  const handlePresetClick = (preset) => {
    setMinutes(preset);
    handleSave(preset);
  };

  const handleCustomBlur = () => {
    let next = parseInt(minutes, 10);
    if (!Number.isFinite(next) || next < 0) next = 0;
    if (next > 43200) next = 43200; // 30 days
    setMinutes(next);
    if (next !== savedMinutes) handleSave(next);
  };

  if (loading) return <SkeletonCard />;

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-lg font-bold text-kotoba-primary">Booking lead time</h2>
      <p className="text-sm text-kotoba-text/70 mt-1">
        How close to a lesson a student is allowed to book it.
        Tighter values protect your prep time;
        lower values mean you'll catch last-minute bookings.
        Currently <span className="font-medium">{friendly(savedMinutes)}</span>.
      </p>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="mt-3 bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm">
          {info}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const isActive = savedMinutes === preset.minutes;
          return (
            <button
              key={preset.minutes}
              type="button"
              onClick={() => handlePresetClick(preset.minutes)}
              disabled={saving || isActive}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-kotoba-primary text-white'
                  : 'bg-kotoba-background border border-kotoba-text/15 text-kotoba-text hover:border-kotoba-primary'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 max-w-xs">
        <label className="text-sm font-medium text-kotoba-text/70 flex-shrink-0" htmlFor="lead-custom">
          Custom:
        </label>
        <input
          id="lead-custom"
          type="number"
          min={0}
          max={43200}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onBlur={handleCustomBlur}
          disabled={saving}
          className="w-24 px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
        />
        <span className="text-sm text-kotoba-text/70">minutes</span>
      </div>
    </section>
  );
};

export default BookingLeadTimePolicy;
