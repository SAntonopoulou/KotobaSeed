import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In progress',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_TONE = {
  open: 'bg-kotoba-secondary/30 text-kotoba-text',
  in_progress: 'bg-kotoba-primary/15 text-kotoba-primary',
  escalated: 'bg-amber-100 text-amber-900',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-kotoba-text/10 text-kotoba-text/60',
};

const PRIORITY_TONE = {
  low: 'bg-kotoba-text/10 text-kotoba-text/60',
  normal: 'bg-kotoba-text/15 text-kotoba-text/70',
  high: 'bg-amber-100 text-amber-900',
  urgent: 'bg-red-100 text-red-800',
};

const formatWhen = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const StatusBadge = ({ status }) => (
  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_TONE[status] || ''}`}>
    {STATUS_LABEL[status] || status}
  </span>
);

const PriorityBadge = ({ priority }) => (
  <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_TONE[priority] || ''}`}>
    {priority}
  </span>
);

const TicketRow = ({ t }) => (
  <Link
    to={`/staff/support/${t.id}`}
    className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-3 py-3 border-b border-kotoba-text/10 hover:bg-kotoba-background/30"
  >
    <div className="min-w-0">
      <p className="font-medium text-kotoba-primary truncate">
        #{t.id} · {t.subject}
      </p>
      <p className="text-xs text-kotoba-text/60 mt-0.5 truncate">
        {t.submitted_by_email} · {t.category} · {formatWhen(t.last_activity_at)}
      </p>
    </div>
    <PriorityBadge priority={t.priority} />
    {t.escalation_level > 0 && (
      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900">
        L{t.escalation_level}
      </span>
    )}
    <StatusBadge status={t.status} />
  </Link>
);

const StaffTicketDetail = ({ id, currentUser }) => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [staffList, setStaffList] = useState([]);

  const canManage = currentUser && ['manager', 'admin'].includes(currentUser.role);

  useEffect(() => {
    // Manager+ sees the assignee dropdown — fetch staff once.
    if (!canManage) return;
    (async () => {
      try {
        const res = await client.get('/staff/support/staff-list');
        setStaffList(res.data || []);
      } catch {
        // Network blip or 403 — degrade to unassign-only.
      }
    })();
  }, [canManage]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/support/tickets/${id}`);
      setTicket(res.data);
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Ticket not found.', 'error');
      navigate('/staff/support');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading || !ticket) {
    return <div className="p-10 text-center text-kotoba-text/60">Loading…</div>;
  }

  const canEscalate = ticket.escalation_level < 2 && currentUser?.role !== 'admin';

  const setStatus = async (newStatus) => {
    setBusy(true);
    try {
      const res = await client.post(`/staff/support/tickets/${ticket.id}/status`, {
        status: newStatus,
      });
      setTicket(res.data);
      addToast('Status updated.', 'success');
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Could not change status.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const setPriority = async (newPriority) => {
    setBusy(true);
    try {
      const res = await client.post(`/staff/support/tickets/${ticket.id}/priority`, {
        priority: newPriority,
      });
      setTicket(res.data);
      addToast('Priority updated.', 'success');
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Could not change priority.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const assignTo = async (userId) => {
    setBusy(true);
    try {
      const res = await client.post(`/staff/support/tickets/${ticket.id}/assign`, {
        assigned_to_user_id: userId || null,
      });
      setTicket(res.data);
      addToast(userId ? 'Assigned.' : 'Unassigned.', 'success');
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Could not assign.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const escalate = async () => {
    if (!window.confirm('Escalate this ticket to the next tier?')) return;
    setBusy(true);
    try {
      const res = await client.post(`/staff/support/tickets/${ticket.id}/escalate`);
      setTicket(res.data);
      addToast('Escalated.', 'success');
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Could not escalate.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const res = await client.post(`/support/tickets/${ticket.id}/reply`, {
        body: reply.trim(),
      });
      setTicket(res.data);
      setReply('');
      addToast('Reply sent.', 'success');
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Could not send reply.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendNote = async (e) => {
    e.preventDefault();
    if (!internalNote.trim()) return;
    setBusy(true);
    try {
      const res = await client.post(`/staff/support/tickets/${ticket.id}/note`, {
        body: internalNote.trim(),
      });
      setTicket(res.data);
      setInternalNote('');
      addToast('Internal note saved.', 'success');
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Could not save note.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <Link
        to="/staff/support"
        className="text-sm text-kotoba-text/60 hover:text-kotoba-primary"
      >
        ← Back to queue
      </Link>

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-kotoba-primary">
              #{ticket.id} · {ticket.subject}
            </h1>
            <p className="text-xs text-kotoba-text/60 mt-1">
              Submitted by{' '}
              <span className="font-medium">{ticket.submitted_by_name || ticket.submitted_by_email}</span>
              {' · '}
              {ticket.submitted_by_email}
              {' · '}
              {ticket.category}
              {ticket.escalation_level > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-xs">
                  Escalation level {ticket.escalation_level}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>

        {/* Staff controls */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-kotoba-text/10">
          <select
            value={ticket.status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={busy}
            className="px-2 py-1 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          >
            {['open', 'in_progress', 'resolved'].map((s) => (
              <option key={s} value={s}>
                Set status: {STATUS_LABEL[s]}
              </option>
            ))}
            {canManage && <option value="closed">Set status: Closed</option>}
          </select>
          <select
            value={ticket.priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={busy}
            className="px-2 py-1 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          >
            {['low', 'normal', 'high', 'urgent'].map((p) => (
              <option key={p} value={p}>
                Priority: {p}
              </option>
            ))}
          </select>
          {canEscalate && (
            <button
              type="button"
              onClick={escalate}
              disabled={busy}
              className="px-3 py-1 rounded border border-amber-500 text-amber-700 text-sm font-medium hover:bg-amber-50"
            >
              Escalate ↑
            </button>
          )}
          {canManage && (
            <select
              value={ticket.assigned_to_user_id ?? ''}
              onChange={(e) =>
                assignTo(e.target.value ? Number(e.target.value) : null)
              }
              disabled={busy}
              className="px-2 py-1 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            >
              <option value="">Unassigned</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  Assign to {s.full_name || s.email} ({s.role})
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-kotoba-primary">Conversation</h2>
        <div className="rounded-lg border border-kotoba-text/10 p-4 bg-kotoba-background/30">
          <p className="text-xs text-kotoba-text/60 mb-1">
            {ticket.submitted_by_name || 'User'} · {formatWhen(ticket.created_at)}
          </p>
          <p className="whitespace-pre-wrap text-kotoba-text">{ticket.body}</p>
        </div>
        {(ticket.messages || []).map((m) => (
          <div
            key={m.id}
            className={`rounded-lg border p-4 ${
              m.is_internal
                ? 'border-amber-300 bg-amber-50'
                : m.author_user_id === ticket.submitted_by_user_id
                  ? 'border-kotoba-text/10 bg-kotoba-background/30'
                  : 'border-kotoba-primary/30 bg-kotoba-primary/5'
            }`}
          >
            <p className="text-xs text-kotoba-text/60 mb-1">
              {m.is_internal && <span className="font-semibold text-amber-700 mr-2">INTERNAL</span>}
              {m.author_label} · {formatWhen(m.created_at)}
            </p>
            <p className="whitespace-pre-wrap text-kotoba-text">{m.body}</p>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <form onSubmit={sendReply} className="space-y-2">
          <label className="block text-sm font-medium text-kotoba-text">
            Public reply (the user sees this)
          </label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy || !reply.trim()}
              className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
            >
              Send reply
            </button>
          </div>
        </form>
        <form onSubmit={sendNote} className="space-y-2 pt-4 border-t border-kotoba-text/10">
          <label className="block text-sm font-medium text-kotoba-text">
            Internal note (only staff see this)
          </label>
          <textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            rows={3}
            placeholder="Notes for the next staff member who looks at this ticket"
            className="w-full px-3 py-2 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50/30"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy || !internalNote.trim()}
              className="px-5 py-2 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50"
            >
              Save internal note
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};

const StaffSupport = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { ticketId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  const statusFilter = searchParams.get('status') || '';
  const priorityFilter = searchParams.get('priority') || '';
  const assignedFilter = searchParams.get('assigned_to_me') === '1';

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    (async () => {
      try {
        const me = await client.get('/users/me');
        setCurrentUser(me.data);
        if (!['support', 'manager', 'admin', 'moderator'].includes(me.data.role)) {
          navigate('/');
        }
      } catch {
        navigate('/login');
      }
    })();
  }, [token, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (assignedFilter) params.set('assigned_to_me', 'true');
      const res = await client.get(`/staff/support/tickets?${params.toString()}`);
      setTickets(res.data || []);
    } catch {
      // Probably 403 — handled by the role gate above.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) load();
  }, [currentUser, statusFilter, priorityFilter, assignedFilter]);

  if (ticketId) {
    return <StaffTicketDetail id={ticketId} currentUser={currentUser} />;
  }

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-kotoba-primary">Support queue</h1>
          <p className="text-sm text-kotoba-text/70 mt-1">
            {tickets.length} tickets shown · ordered by most recent activity
          </p>
        </div>
      </header>

      <section className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-kotoba-text/70 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setFilter('status', e.target.value)}
            className="px-2 py-1 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          >
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-kotoba-text/70 mb-1">Priority</label>
          <select
            value={priorityFilter}
            onChange={(e) => setFilter('priority', e.target.value)}
            className="px-2 py-1 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          >
            <option value="">All</option>
            {['low', 'normal', 'high', 'urgent'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-kotoba-text">
          <input
            type="checkbox"
            checked={assignedFilter}
            onChange={(e) => setFilter('assigned_to_me', e.target.checked ? '1' : '')}
            className="h-4 w-4 text-kotoba-primary rounded"
          />
          Assigned to me
        </label>
      </section>

      <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-sm text-kotoba-text/70 p-6">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-kotoba-text/70 p-6">
            No tickets match these filters.
          </p>
        ) : (
          tickets.map((t) => <TicketRow key={t.id} t={t} />)
        )}
      </section>
    </main>
  );
};

export default StaffSupport;
