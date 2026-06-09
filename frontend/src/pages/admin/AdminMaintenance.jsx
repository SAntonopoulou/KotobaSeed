import React, { useCallback, useEffect, useState } from 'react';
import client from '../../api/client';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/dates';
import { getErrorMessage } from '../../utils/errors';

// Admin schedules / cancels maintenance windows.
//
// Scheduling a window auto-issues BookingCredit rows to every student
// whose booking falls inside it, and stamps a notification in their
// inbox. Cancelling expires those credits.
//
// The public banner + hard modal across the SPA pick this up by
// polling /platform/maintenance — admins don't need to do anything
// further once they schedule.

const STATUS_TONE = {
  scheduled: 'bg-amber-100 text-amber-900',
  active: 'bg-red-100 text-red-900',
  completed: 'bg-kotoba-background/60 text-kotoba-text/70',
  cancelled: 'bg-kotoba-background/60 text-kotoba-text/50',
};

const AdminMaintenance = () => {
  const { addToast } = useToast();
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    scheduled_start_at: '',
    duration_minutes: 30,
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/maintenance');
      setWindows(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load maintenance windows.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.scheduled_start_at || !form.message.trim()) {
      addToast('Pick a time and write a message.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await client.post('/admin/maintenance', {
        scheduled_start_at: new Date(form.scheduled_start_at).toISOString(),
        duration_minutes: Number(form.duration_minutes),
        message: form.message.trim(),
      });
      addToast(
        `Scheduled. ${res.data.affected_booking_count} affected booking(s) credited.`,
        'success',
      );
      setForm({ scheduled_start_at: '', duration_minutes: 30, message: '' });
      load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not schedule maintenance.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setCancelTarget(null);
    try {
      await client.delete(`/admin/maintenance/${id}`);
      addToast('Cancelled. Issued credits are now expired.', 'success');
      load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not cancel.'), 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-kotoba-primary">Maintenance windows</h1>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Schedule downtime ahead of time. Affected bookings get an automatic free-lesson credit + an inbox notification.
        </p>
      </header>

      <form onSubmit={submit} className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-kotoba-text">Schedule a new window</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="scheduled_start_at" className="block text-sm font-medium text-kotoba-text/80">
              Start (your local time)
            </label>
            <input
              id="scheduled_start_at"
              name="scheduled_start_at"
              type="datetime-local"
              required
              value={form.scheduled_start_at}
              onChange={onChange}
              min={new Date(Date.now() + 11 * 60 * 1000).toISOString().slice(0, 16)}
              className="mt-1 block w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
            />
            <p className="mt-1 text-xs text-kotoba-text/60">
              Must be at least 10 minutes from now — gives users time to see the banner.
            </p>
          </div>
          <div>
            <label htmlFor="duration_minutes" className="block text-sm font-medium text-kotoba-text/80">
              Duration (minutes)
            </label>
            <input
              id="duration_minutes"
              name="duration_minutes"
              type="number"
              min="5"
              max="480"
              required
              value={form.duration_minutes}
              onChange={onChange}
              className="mt-1 block w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
            />
          </div>
        </div>
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-kotoba-text/80">
            Message (shown in banner + hard modal + maintenance page)
          </label>
          <textarea
            id="message"
            name="message"
            rows="3"
            required
            maxLength={1000}
            value={form.message}
            onChange={onChange}
            placeholder="We're upgrading the booking flow — should take about 20 minutes."
            className="mt-1 block w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-60"
        >
          {submitting ? 'Scheduling…' : 'Schedule maintenance'}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-semibold text-kotoba-text mb-3">Recent windows</h2>
        {loading ? (
          <p className="text-kotoba-text/60">Loading…</p>
        ) : windows.length === 0 ? (
          <p className="text-kotoba-text/60">No maintenance windows yet.</p>
        ) : (
          <div className="space-y-3">
            {windows.map((w) => (
              <div key={w.id} className="bg-white rounded-lg shadow-sm p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_TONE[w.status] || ''}`}>
                      {w.status}
                    </span>
                    <span className="text-sm text-kotoba-text/70">
                      {formatDateTime(w.scheduled_start_at)} · {w.duration_minutes} min
                    </span>
                  </div>
                  <p className="text-sm text-kotoba-text whitespace-pre-wrap">{w.message}</p>
                  <p className="mt-2 text-xs text-kotoba-text/60">
                    Affected bookings credited: <strong>{w.affected_booking_count}</strong>
                  </p>
                </div>
                {w.status === 'scheduled' && (
                  <button
                    type="button"
                    onClick={() => setCancelTarget(w)}
                    className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmationModal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancel}
        title="Cancel maintenance window"
        message={
          cancelTarget
            ? `Cancel the window scheduled for ${formatDateTime(cancelTarget.scheduled_start_at)}? The ${cancelTarget.affected_booking_count} issued credit(s) will be expired.`
            : ''
        }
        confirmText="Cancel maintenance"
        isDanger
      />
    </div>
  );
};

export default AdminMaintenance;
