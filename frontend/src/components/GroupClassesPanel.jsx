import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Group lesson management — list group-flagged packs, create new group
// packs (a different shape from 1:1 packs), schedule sessions, view
// upcoming sessions with seat counts.

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

const formatDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const NewGroupPackForm = ({ onCreated }) => {
  const [form, setForm] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price_cents: 1500,
    max_students: 6,
    min_students: 3,
    group_min_threshold_hours: 24,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.min_students > form.max_students) {
      setError('Minimum students can\'t exceed the maximum.');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/tutor/lesson-packs', {
        name: form.name.trim() || 'Group lesson',
        description: form.description.trim() || null,
        num_lessons: 1,
        duration_minutes: Number(form.duration_minutes),
        price_cents: Number(form.price_cents),
        is_group: true,
        max_students: Number(form.max_students),
        min_students: Number(form.min_students),
        group_min_threshold_hours: Number(form.group_min_threshold_hours),
      });
      onCreated();
      setForm({
        name: '',
        description: '',
        duration_minutes: 60,
        price_cents: 1500,
        max_students: 6,
        min_students: 3,
        group_min_threshold_hours: 24,
      });
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not create the group lesson.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-kotoba-text/15 p-4 bg-kotoba-background/30">
      <h3 className="font-semibold text-kotoba-primary">New group lesson type</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      <input
        type="text"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Lesson name (e.g. Greek conversation circle)"
        className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
      />
      <textarea
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="Description (optional)"
        rows={2}
        className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="block text-xs text-kotoba-text/70 mb-1">Duration (min)</label>
          <input
            type="number"
            min={15}
            max={240}
            step={15}
            value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
            className="w-full px-2 py-1 border border-kotoba-text/20 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-kotoba-text/70 mb-1">Price (€)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.price_cents / 100}
            onChange={(e) => setForm({ ...form, price_cents: Math.round(Number(e.target.value) * 100) })}
            className="w-full px-2 py-1 border border-kotoba-text/20 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-kotoba-text/70 mb-1">Min students</label>
          <input
            type="number"
            min={2}
            max={200}
            value={form.min_students}
            onChange={(e) => setForm({ ...form, min_students: e.target.value })}
            className="w-full px-2 py-1 border border-kotoba-text/20 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-kotoba-text/70 mb-1">Max students</label>
          <input
            type="number"
            min={2}
            max={200}
            value={form.max_students}
            onChange={(e) => setForm({ ...form, max_students: e.target.value })}
            className="w-full px-2 py-1 border border-kotoba-text/20 rounded text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-kotoba-text/70 mb-1">
          Minimum-attendance check (hours before lesson)
        </label>
        <input
          type="number"
          min={1}
          max={168}
          value={form.group_min_threshold_hours}
          onChange={(e) => setForm({ ...form, group_min_threshold_hours: e.target.value })}
          className="w-32 px-2 py-1 border border-kotoba-text/20 rounded text-sm"
        />
        <p className="text-xs text-kotoba-text/60 mt-1">
          If fewer than {form.min_students} students have booked by this point,
          everyone is refunded and the session is cancelled.
        </p>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Create group lesson type'}
      </button>
    </form>
  );
};

const ScheduleSessionForm = ({ packs, onCreated }) => {
  const [packId, setPackId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (packs.length === 0) {
    return (
      <p className="text-sm text-kotoba-text/60 italic">
        Create a group lesson type above before scheduling sessions.
      </p>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!packId || !scheduledAt) {
      setError('Pick a lesson type and a time.');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/tutor/group-sessions', {
        lesson_pack_id: Number(packId),
        scheduled_at: new Date(scheduledAt).toISOString(),
        notes: notes.trim() || null,
      });
      onCreated();
      setPackId('');
      setScheduledAt('');
      setNotes('');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not schedule the session.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-kotoba-text/15 p-4">
      <h3 className="font-semibold text-kotoba-primary">Schedule a session</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <select
          value={packId}
          onChange={(e) => setPackId(e.target.value)}
          className="px-3 py-2 border border-kotoba-text/20 rounded text-sm"
        >
          <option value="">Pick a group lesson type</option>
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.min_students}–{p.max_students} students)
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="px-3 py-2 border border-kotoba-text/20 rounded text-sm"
        />
      </div>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes for students (topic, prep, etc.)"
        className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
      >
        {submitting ? 'Scheduling…' : 'Schedule session'}
      </button>
    </form>
  );
};

const GroupClassesPanel = () => {
  const [packs, setPacks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [packsRes, sessionsRes] = await Promise.all([
        client.get('/tutor/lesson-packs/all').catch(() => ({ data: [] })),
        client.get('/tutor/group-sessions').catch(() => ({ data: [] })),
      ]);
      setPacks((packsRes.data || []).filter((p) => p.is_group));
      setSessions(sessionsRes.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load group classes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cancelSession = async (s) => {
    if (!window.confirm(`Cancel this group session? Every booked student will be refunded.`)) return;
    try {
      await client.delete(`/tutor/group-sessions/${s.id}`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not cancel.');
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-kotoba-primary">Group classes</h2>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Schedule lessons that multiple students share. Set a minimum and maximum size; if the minimum isn't met by your cutoff, every student is refunded automatically.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      <NewGroupPackForm onCreated={load} />

      <ScheduleSessionForm packs={packs} onCreated={load} />

      <div>
        <h3 className="font-semibold text-kotoba-primary mb-2">Scheduled sessions</h3>
        {loading ? (
          <p className="text-sm text-kotoba-text/70">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-kotoba-text/60 italic">
            No group sessions yet.
          </p>
        ) : (
          <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
            {sessions.map((s) => (
              <li key={s.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-grow">
                  <p className="font-medium text-kotoba-primary">
                    {s.pack_name} · {formatDateTime(s.scheduled_at)}
                  </p>
                  <p className="text-xs text-kotoba-text/60 mt-0.5">
                    {s.seats_filled} / {s.max_students} students booked · min {s.min_students} · {formatPrice(s.price_cents, s.currency)}/seat
                    {s.is_cancelled && <span className="ml-2 text-red-600">Cancelled</span>}
                  </p>
                </div>
                {!s.is_cancelled && (
                  <button
                    type="button"
                    onClick={() => cancelSession(s)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default GroupClassesPanel;
