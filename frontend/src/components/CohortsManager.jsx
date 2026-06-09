import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { getErrorMessage } from '../utils/errors';

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

// Format a Date into the value expected by <input type="datetime-local">
// — always local time, no timezone offset suffix.
const toLocalInput = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const STATUS_LABEL = {
  draft: 'Draft',
  open: 'Open',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

const STATUS_TONE = {
  draft: 'bg-kotoba-text/10 text-kotoba-text/60',
  open: 'bg-kotoba-secondary/40 text-kotoba-text',
  confirmed: 'bg-kotoba-primary/15 text-kotoba-primary',
  cancelled: 'bg-red-100 text-red-700',
};

const blankForm = () => ({
  group_id: '',
  title: '',
  description: '',
  lesson_schedule_note: '',
  num_lessons: 8,
  duration_minutes: 60,
  price_per_seat_cents: 0,
  currency: 'eur',
  max_seats: 6,
  min_seats: 3,
  first_session_at: '',
  enrollment_deadline: '',
});

const CohortsManager = () => {
  const confirm = useConfirm();
  const [cohorts, setCohorts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, gRes] = await Promise.all([
        client.get('/tutor/cohorts'),
        client.get('/groups'),
      ]);
      setCohorts(cRes.data || []);
      setGroups(gRes.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load cohorts.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startCompose = () => {
    setEditing({ id: null, ...blankForm() });
    setError('');
    setInfo('');
  };

  const startEdit = (c) => {
    setEditing({
      id: c.id,
      group_id: groups.find((g) => g.language_name === c.group_language)?.id || '',
      title: c.title,
      description: c.description || '',
      lesson_schedule_note: c.lesson_schedule_note || '',
      num_lessons: c.num_lessons,
      duration_minutes: c.duration_minutes,
      price_per_seat_cents: c.price_per_seat_cents,
      currency: c.currency,
      max_seats: c.max_seats,
      min_seats: c.min_seats,
      first_session_at: toLocalInput(c.first_session_at),
      enrollment_deadline: toLocalInput(c.enrollment_deadline),
    });
    setError('');
    setInfo('');
  };

  const cancelEdit = () => setEditing(null);

  const save = async () => {
    const e = editing;
    if (!e.title.trim()) { setError('Give it a title.'); return; }
    if (!e.group_id) { setError('Pick a language group.'); return; }
    if (!e.first_session_at || !e.enrollment_deadline) {
      setError('Set both dates.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        group_id: parseInt(e.group_id, 10),
        title: e.title.trim(),
        description: e.description.trim() || null,
        lesson_schedule_note: e.lesson_schedule_note.trim() || null,
        num_lessons: parseInt(e.num_lessons, 10),
        duration_minutes: parseInt(e.duration_minutes, 10),
        price_per_seat_cents: Math.round(Number(e.price_per_seat_cents) || 0),
        currency: e.currency || 'eur',
        max_seats: parseInt(e.max_seats, 10),
        min_seats: parseInt(e.min_seats, 10),
        first_session_at: new Date(e.first_session_at).toISOString(),
        enrollment_deadline: new Date(e.enrollment_deadline).toISOString(),
      };
      if (e.id) {
        await client.patch(`/tutor/cohorts/${e.id}`, payload);
        setInfo('Saved.');
      } else {
        await client.post('/tutor/cohorts', payload);
        setInfo('Cohort created as draft. Publish it when ready.');
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  const publish = async (c) => {
    setBusy(true);
    try {
      await client.post(`/tutor/cohorts/${c.id}/publish`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not publish.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmManual = async (c) => {
    if (!(await confirm({
      title: 'Confirm cohort',
      message: `Confirm "${c.title}" with ${c.seats_filled} of ${c.max_seats} seats? Enrollment closes immediately.`,
      confirmText: 'Confirm cohort',
    }))) return;
    setBusy(true);
    try {
      await client.post(`/tutor/cohorts/${c.id}/confirm`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not confirm.'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (c) => {
    if (!(await confirm({
      title: 'Cancel cohort',
      message: `Cancel "${c.title}"? Every paid seat will be refunded.`,
      confirmText: 'Cancel cohort',
      destructive: true,
    }))) return;
    setBusy(true);
    try {
      await client.delete(`/tutor/cohorts/${c.id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not cancel.'));
    } finally {
      setBusy(false);
    }
  };

  const priceEuro = useMemo(() => {
    if (!editing) return '';
    return editing.price_per_seat_cents ? (editing.price_per_seat_cents / 100).toFixed(2) : '';
  }, [editing]);

  if (loading) {
    return (
      <section className="bg-white rounded-3xl shadow-soft p-6">
        <h2 className="font-display text-xl font-bold text-kotoba-primary">Cohorts</h2>
        <p className="text-sm text-kotoba-text/65 mt-2">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-3xl shadow-soft p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-bold text-kotoba-primary">Cohorts</h2>
          <p className="mt-1 text-sm text-kotoba-text/65 max-w-xl">
            Sell seats in a fixed-schedule group lesson series. Cohorts surface on the
            language group page. If your minimum seats aren't met by the deadline, paid
            seats are auto-refunded.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startCompose}
            className="px-4 py-2 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft text-sm"
          >
            + New cohort
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-2xl text-sm">{error}</div>}
      {info && !error && <div className="bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-2xl text-sm">{info}</div>}

      {editing && (
        <div className="rounded-2xl border border-kotoba-primary/20 bg-kotoba-primary/[0.03] p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Language group</span>
              <select
                value={editing.group_id}
                onChange={(e) => setEditing({ ...editing, group_id: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
              >
                <option value="">Pick a group…</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.language_name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Title</span>
              <input
                type="text"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                maxLength={200}
                placeholder="JLPT N3 reading group, 8 weeks"
                className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Description</span>
            <textarea
              rows={3}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              maxLength={4000}
              placeholder="Who this is for, what you'll cover, the vibe of the room."
              className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Schedule note</span>
            <input
              type="text"
              value={editing.lesson_schedule_note}
              onChange={(e) => setEditing({ ...editing, lesson_schedule_note: e.target.value })}
              maxLength={500}
              placeholder="Tuesdays 18:00 UTC for 8 weeks"
              className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
            />
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block text-sm">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Lessons</span>
              <input
                type="number" min={1} max={52}
                value={editing.num_lessons}
                onChange={(e) => setEditing({ ...editing, num_lessons: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Min · per lesson</span>
              <input
                type="number" min={15} max={240}
                value={editing.duration_minutes}
                onChange={(e) => setEditing({ ...editing, duration_minutes: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Min seats</span>
              <input
                type="number" min={1} max={editing.max_seats}
                value={editing.min_seats}
                onChange={(e) => setEditing({ ...editing, min_seats: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Max seats</span>
              <input
                type="number" min={2} max={50}
                value={editing.max_seats}
                onChange={(e) => setEditing({ ...editing, max_seats: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10"
              />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">First session (local)</span>
              <input
                type="datetime-local"
                value={editing.first_session_at}
                onChange={(e) => setEditing({ ...editing, first_session_at: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Enrollment deadline (local)</span>
              <input
                type="datetime-local"
                value={editing.enrollment_deadline}
                onChange={(e) => setEditing({ ...editing, enrollment_deadline: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">Price per seat (€)</span>
            <input
              type="number" min={0} step="0.01"
              value={priceEuro}
              onChange={(e) => setEditing({ ...editing, price_per_seat_cents: Math.round((Number(e.target.value) || 0) * 100) })}
              placeholder="49.00"
              className="mt-1 w-40 px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10"
            />
            <p className="mt-1 text-xs text-kotoba-text/55">
              Platform fee follows your tier (10/7/5/0%). Rest goes to your Stripe Connect account.
            </p>
          </label>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-kotoba-text/[0.06]">
            <button type="button" onClick={cancelEdit} disabled={busy} className="px-4 py-2 text-sm text-kotoba-text/65 hover:text-kotoba-text">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="px-5 py-2 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-50"
            >
              {busy ? 'Saving…' : (editing.id ? 'Save changes' : 'Create draft')}
            </button>
          </div>
        </div>
      )}

      {!editing && cohorts.length === 0 && (
        <p className="text-sm text-kotoba-text/65">
          No cohorts yet. Pick a language group, set a schedule and a seat cap.
        </p>
      )}

      {!editing && cohorts.length > 0 && (
        <ul className="space-y-3">
          {cohorts.map((c) => (
            <li key={c.id} className="rounded-2xl border border-kotoba-text/[0.06] p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-bold text-kotoba-primary text-base leading-tight">
                      {c.title}
                    </h3>
                    <span className={`text-[10px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded ${STATUS_TONE[c.status] || ''}`}>
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                    <span className="text-xs text-kotoba-text/55">{c.group_language}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-kotoba-text/65 flex-wrap">
                    <span>{c.num_lessons} × {c.duration_minutes} min</span>
                    <span>·</span>
                    <span className="font-display font-bold text-kotoba-primary tabular-nums">
                      {formatPrice(c.price_per_seat_cents, c.currency)}
                    </span>
                    <span>·</span>
                    <span>Seats {c.seats_filled}/{c.max_seats}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {c.status === 'draft' && (
                    <>
                      <button type="button" onClick={() => startEdit(c)} className="text-xs px-3 py-1.5 rounded-xl border border-kotoba-text/15 hover:border-kotoba-primary">Edit</button>
                      <button type="button" onClick={() => publish(c)} disabled={busy} className="text-xs px-3 py-1.5 rounded-xl bg-kotoba-secondary text-kotoba-text font-semibold disabled:opacity-50">Publish</button>
                    </>
                  )}
                  {c.status === 'open' && (
                    <>
                      <button type="button" onClick={() => startEdit(c)} className="text-xs px-3 py-1.5 rounded-xl border border-kotoba-text/15 hover:border-kotoba-primary">Edit</button>
                      <button type="button" onClick={() => confirmManual(c)} disabled={busy || c.seats_filled < c.min_seats} className="text-xs px-3 py-1.5 rounded-xl bg-kotoba-primary text-white font-semibold disabled:opacity-50">Confirm now</button>
                      <button type="button" onClick={() => cancel(c)} disabled={busy} className="text-xs px-3 py-1.5 rounded-xl border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50">Cancel</button>
                    </>
                  )}
                  {c.status === 'confirmed' && (
                    <button type="button" onClick={() => cancel(c)} disabled={busy} className="text-xs px-3 py-1.5 rounded-xl border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50">Cancel + refund</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CohortsManager;
