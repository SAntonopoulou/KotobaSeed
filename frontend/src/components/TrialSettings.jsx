import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

const TrialSettings = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/trial');
      setConfig(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load trial settings.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (next) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const res = await client.put('/tutor/trial', next);
      setConfig(res.data);
      setInfo('Saved.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return <SkeletonCard />;
  }

  const handleToggle = (e) => {
    save({
      ...config,
      offers_free_trial: e.target.checked,
    });
  };

  const handleMinutes = (e) => {
    const v = parseInt(e.target.value || '20', 10);
    setConfig({ ...config, free_trial_minutes: v });
  };

  const handleBlur = () => {
    save(config);
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Free trial</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Offer a short intro lesson so prospective students can try you before booking a paid one. Helps with conversion — and a polite way to qualify whether you and a student are a fit.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-kotoba-text">
          <input
            type="checkbox"
            checked={config.offers_free_trial}
            onChange={handleToggle}
            disabled={saving}
            className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
          />
          Offering trials
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm mb-3">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm mb-3">
          {info}
        </div>
      )}

      {config.offers_free_trial && (
        <div className="mt-3 max-w-xs">
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            Trial duration (minutes)
          </label>
          <input
            type="number"
            min={15}
            max={120}
            step={5}
            value={config.free_trial_minutes}
            onChange={handleMinutes}
            onBlur={handleBlur}
            disabled={saving}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <p className="mt-1 text-xs text-kotoba-text/60">
            15–120 minutes. 20 is a common pick.
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-kotoba-text/60">
        Each student can book one free trial with you, lifetime — protects the trial as a conversion tool. To open specific times to trials, switch to <span className="font-medium">Regular + trial</span> mode in your availability grid above. Trial-flagged windows stay bookable for paid lessons too — they just additionally accept trials, so your peak hours stay yours.
      </p>
    </section>
  );
};

export default TrialSettings;
