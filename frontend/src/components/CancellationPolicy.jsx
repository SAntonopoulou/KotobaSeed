import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

// Tutor sets the minimum hours-before-lesson at which students can still
// cancel. Platform floor is 24; the input enforces 24-720 (30 days).
// Pre-baked presets cover the common cases — strict tutors can type a
// custom value.

const PRESETS = [
  { label: '24 hours (1 day)', hours: 24 },
  { label: '48 hours (platform default)', hours: 48 },
  { label: '72 hours (3 days)', hours: 72 },
  { label: '168 hours (1 week)', hours: 168 },
];

const CancellationPolicy = () => {
  const [hours, setHours] = useState(48);
  const [savedHours, setSavedHours] = useState(48);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/me');
      const h = res.data?.cancellation_cutoff_hours ?? 48;
      setHours(h);
      setSavedHours(h);
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
        cancellation_cutoff_hours: next,
      });
      const h = res.data?.cancellation_cutoff_hours ?? next;
      setHours(h);
      setSavedHours(h);
      setInfo('Saved.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  const handlePresetClick = (preset) => {
    setHours(preset);
    handleSave(preset);
  };

  const handleCustomBlur = () => {
    let next = parseInt(hours, 10);
    if (!Number.isFinite(next)) next = 48;
    if (next < 24) next = 24;
    if (next > 720) next = 720;
    setHours(next);
    if (next !== savedHours) {
      handleSave(next);
    }
  };

  if (loading) {
    return <SkeletonCard />;
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-lg font-bold text-kotoba-primary">Cancellation policy</h2>
      <p className="text-sm text-kotoba-text/70 mt-1">
        Students can cancel and get a refund up to this many hours before a lesson. After that, the booking is locked in — protects you from last-minute cancellations and no-shows. The platform floor is 24 hours; you can be stricter but not more lenient.
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
          const isActive = savedHours === preset.hours;
          return (
            <button
              key={preset.hours}
              type="button"
              onClick={() => handlePresetClick(preset.hours)}
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
        <label className="text-sm font-medium text-kotoba-text/70 flex-shrink-0" htmlFor="cutoff-custom">
          Custom:
        </label>
        <input
          id="cutoff-custom"
          type="number"
          min={24}
          max={720}
          step={24}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onBlur={handleCustomBlur}
          disabled={saving}
          className="w-24 px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
        />
        <span className="text-sm text-kotoba-text/70">hours</span>
      </div>
    </section>
  );
};

export default CancellationPolicy;
