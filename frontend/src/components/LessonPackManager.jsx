import React, { useEffect, useState } from 'react';
import client from '../api/client';

const emptyForm = {
  name: '',
  description: '',
  num_lessons: 1,
  duration_minutes: 60,
  price_cents: 2500,
  currency: 'eur',
};

const eurosToCents = (val) => Math.round(parseFloat(val) * 100);
const centsToEuros = (cents) => (cents / 100).toFixed(2);

const LessonPackManager = () => {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/lesson-packs/all');
      setPacks(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load lesson packs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEditing = (pack) => {
    setEditingId(pack.id);
    setForm({
      name: pack.name,
      description: pack.description || '',
      num_lessons: pack.num_lessons,
      duration_minutes: pack.duration_minutes,
      price_cents: pack.price_cents,
      currency: pack.currency,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await client.patch(`/tutor/lesson-packs/${editingId}`, form);
      } else {
        await client.post('/tutor/lesson-packs', form);
      }
      cancelEditing();
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (pack) => {
    try {
      if (pack.is_active) {
        await client.delete(`/tutor/lesson-packs/${pack.id}`);
      } else {
        await client.patch(`/tutor/lesson-packs/${pack.id}`, { is_active: true });
      }
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not toggle pack.');
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-kotoba-primary">Lesson packs</h2>
        {!editingId && packs.length > 0 && (
          <span className="text-xs text-kotoba-text/60">
            {packs.filter((p) => p.is_active).length} active · {packs.length} total
          </span>
        )}
      </div>
      <p className="text-sm text-kotoba-text/70 mb-4">
        Packages students can buy on your site. Common examples: "1 lesson — €25", "5 lessons — €110", "10 lessons — €200".
      </p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      ) : packs.length === 0 ? (
        <p className="text-sm text-kotoba-text/70 mb-4">No packs yet. Add your first one below.</p>
      ) : (
        <ul className="mb-6 divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-lg">
          {packs.map((pack) => (
            <li key={pack.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1">
                <div className="font-medium text-kotoba-text">
                  {pack.name}
                  {!pack.is_active && (
                    <span className="ml-2 text-xs uppercase tracking-wide text-kotoba-text/50">Inactive</span>
                  )}
                </div>
                <div className="text-xs text-kotoba-text/60">
                  {pack.num_lessons} × {pack.duration_minutes} min · €{centsToEuros(pack.price_cents)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => startEditing(pack)}
                className="text-sm text-kotoba-primary hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleToggle(pack)}
                className="text-sm text-kotoba-text/70 hover:text-kotoba-text"
              >
                {pack.is_active ? 'Hide' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 border border-kotoba-text/10 rounded-lg p-4 bg-kotoba-background/40">
        <div className="text-sm font-medium text-kotoba-primary">
          {editingId ? 'Edit pack' : 'Add a pack'}
        </div>

        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Description (optional)</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Lessons</label>
            <input
              type="number"
              min={1}
              max={200}
              value={form.num_lessons}
              onChange={(e) => setForm({ ...form, num_lessons: parseInt(e.target.value || '1', 10) })}
              required
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Minutes each</label>
            <input
              type="number"
              min={15}
              max={240}
              step={15}
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value || '60', 10) })}
              required
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Price (€ total)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={centsToEuros(form.price_cents)}
              onChange={(e) => setForm({ ...form, price_cents: eurosToCents(e.target.value || '0') })}
              required
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
          >
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add pack'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEditing}
              className="text-sm text-kotoba-text/70 hover:text-kotoba-text"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
};

export default LessonPackManager;
