import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';

// Headline single-lesson price editor — most tutors have one rate
// (e.g. €25 / 60 min) and don't need the full lesson-pack editor for it.
// Backed by /tutor/single-lesson which maps to a LessonPack row with
// is_default_single=True. The public site renders this pack inline when
// it's the only single-lesson offering, or as a box alongside any extras.

const blank = {
  price_cents: '',
  duration_minutes: 60,
  currency: 'eur',
};

const centsToInput = (cents) => (cents == null ? '' : (cents / 100).toFixed(2));
const inputToCents = (str) => {
  const n = Number(String(str).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

const formatPrice = (cents, currency) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'eur').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
};

const SingleLessonQuickSet = () => {
  const [form, setForm] = useState(blank);
  const [existing, setExisting] = useState(null); // { price_cents, duration_minutes, currency, is_active } or null
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/single-lesson');
      const data = res.data || {};
      setExisting(data.price_cents == null ? null : data);
      setForm({
        price_cents: centsToInput(data.price_cents),
        duration_minutes: data.duration_minutes ?? 60,
        currency: data.currency || 'eur',
      });
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load your single-lesson price.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === 'duration_minutes' ? Number(value) : value }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    const cents = inputToCents(form.price_cents);
    if (cents == null) {
      setError('Enter a valid price (e.g. 25 or 25.00).');
      return;
    }
    if (!form.duration_minutes || form.duration_minutes < 15 || form.duration_minutes > 240) {
      setError('Duration must be between 15 and 240 minutes.');
      return;
    }
    setSaving(true);
    try {
      const res = await client.put('/tutor/single-lesson', {
        price_cents: cents,
        duration_minutes: form.duration_minutes,
        currency: form.currency || 'eur',
      });
      setExisting(res.data);
      setInfo('Saved.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove your single-lesson offering? Students won\'t see it on your site anymore.')) {
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await client.delete('/tutor/single-lesson');
      setExisting(null);
      setForm(blank);
      setInfo('Removed.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not remove.');
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    if (!existing || existing.price_cents == null || !existing.is_active) return null;
    return `${formatPrice(existing.price_cents, existing.currency)} · ${existing.duration_minutes} min`;
  }, [existing]);

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Your single lesson</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Your single lesson</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            The headline rate for one lesson. Most tutors keep this simple — you can add multi-lesson packs or alternative single-lesson prices in the section below.
          </p>
        </div>
        {summary && (
          <span className="px-3 py-1.5 rounded-md bg-kotoba-primary/10 text-kotoba-primary text-sm font-medium">
            {summary}
          </span>
        )}
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

      <form onSubmit={handleSave} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1" htmlFor="single-price">
            Price
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kotoba-text/60 text-sm">€</span>
            <input
              id="single-price"
              name="price_cents"
              type="text"
              inputMode="decimal"
              placeholder="25.00"
              value={form.price_cents}
              onChange={handleChange}
              disabled={saving}
              className="w-full pl-7 pr-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1" htmlFor="single-duration">
            Duration (minutes)
          </label>
          <input
            id="single-duration"
            name="duration_minutes"
            type="number"
            min={15}
            max={240}
            step={5}
            value={form.duration_minutes}
            onChange={handleChange}
            disabled={saving}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <div className="flex gap-2 sm:flex-col">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
          >
            {saving ? 'Saving…' : existing ? 'Update' : 'Save'}
          </button>
          {existing?.is_active && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="px-3 py-2 text-sm text-kotoba-text/60 hover:text-kotoba-text"
            >
              Remove
            </button>
          )}
        </div>
      </form>
    </section>
  );
};

export default SingleLessonQuickSet;
