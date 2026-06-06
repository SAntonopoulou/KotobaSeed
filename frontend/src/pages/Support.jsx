import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

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

const CATEGORY_OPTIONS = [
  { value: 'technical', label: 'Technical (something is broken)' },
  { value: 'billing', label: 'Billing or payments' },
  { value: 'account', label: 'My account' },
  { value: 'content', label: 'Content (article, module, lesson)' },
  { value: 'abuse', label: 'Report abuse or safety concern' },
  { value: 'other', label: 'Something else' },
];

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

const NewTicketForm = ({ onCreated, prefill }) => {
  const [form, setForm] = useState({
    subject: prefill?.subject || '',
    body: prefill?.body || '',
    category: prefill?.category || 'other',
    related_booking_id: prefill?.related_booking_id || null,
    related_tutor_id: prefill?.related_tutor_id || null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.subject.trim().length < 3) {
      setError('Subject must be at least 3 characters.');
      return;
    }
    if (form.body.trim().length < 10) {
      setError('Please describe the issue in at least a sentence.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await client.post('/support/tickets', {
        subject: form.subject.trim(),
        body: form.body.trim(),
        category: form.category,
        related_booking_id: form.related_booking_id || null,
        related_tutor_id: form.related_tutor_id || null,
      });
      onCreated(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not submit your ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
      <h2 className="text-lg font-bold text-kotoba-primary">Open a support ticket</h2>
      <p className="text-sm text-kotoba-text/70">
        Tell us what's going on and we'll get back to you. The more detail the better — booking IDs, error messages, screenshots links if you have them.
      </p>
      {(form.related_booking_id || form.related_tutor_id) && (
        <div className="bg-kotoba-primary/5 border border-kotoba-primary/20 px-4 py-2 rounded-md text-sm text-kotoba-text">
          {form.related_booking_id && (
            <p>This ticket is linked to booking <strong>#{form.related_booking_id}</strong>.</p>
          )}
          {form.related_tutor_id && (
            <p>This ticket is linked to tutor <strong>#{form.related_tutor_id}</strong>.</p>
          )}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            What's it about?
          </label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            Subject
          </label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="Short summary of the issue"
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            Details
          </label>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={6}
            placeholder="Describe what happened and what you expected to happen."
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit ticket'}
          </button>
        </div>
      </form>
    </section>
  );
};

const TicketDetail = ({ ticket: initial, onBack }) => {
  const [ticket, setTicket] = useState(initial);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const messages = ticket.messages || [];
  const isClosed = ticket.status === 'closed';

  const sendReply = async (e) => {
    e.preventDefault();
    setError('');
    if (!reply.trim()) return;
    setSubmitting(true);
    try {
      const res = await client.post(`/support/tickets/${ticket.id}/reply`, {
        body: reply.trim(),
      });
      setTicket(res.data);
      setReply('');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not send your reply.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-grow">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-kotoba-text/60 hover:text-kotoba-primary mb-2"
          >
            ← Back to all tickets
          </button>
          <h2 className="text-xl font-bold text-kotoba-primary">{ticket.subject}</h2>
          <p className="text-xs text-kotoba-text/60 mt-1">
            Opened {formatWhen(ticket.created_at)} · {ticket.category}
          </p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      <div className="rounded-lg border border-kotoba-text/10 p-4 bg-kotoba-background/30">
        <p className="text-xs text-kotoba-text/60 mb-1">You wrote:</p>
        <p className="whitespace-pre-wrap text-kotoba-text">{ticket.body}</p>
      </div>

      {messages.map((m) => {
        const fromStaff = m.author_label?.includes('(') && !m.author_user_id === ticket.submitted_by_user_id;
        return (
          <div
            key={m.id}
            className={`rounded-lg border p-4 ${
              fromStaff
                ? 'border-kotoba-primary/30 bg-kotoba-primary/5'
                : 'border-kotoba-text/10 bg-kotoba-background/30'
            }`}
          >
            <p className="text-xs text-kotoba-text/60 mb-1">
              {m.author_label} · {formatWhen(m.created_at)}
            </p>
            <p className="whitespace-pre-wrap text-kotoba-text">{m.body}</p>
          </div>
        );
      })}

      {!isClosed ? (
        <form onSubmit={sendReply} className="space-y-2 pt-2 border-t border-kotoba-text/10">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
              {error}
            </div>
          )}
          <label className="block text-xs font-medium text-kotoba-text/70">
            Add a reply
          </label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder="Anything to add or clarify…"
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !reply.trim()}
              className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-kotoba-text/60 italic pt-2 border-t border-kotoba-text/10">
          This ticket is closed. If you need more help, open a new one above.
        </p>
      )}
    </section>
  );
};

const Support = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { ticketId } = useParams();
  const [searchParams] = useSearchParams();
  const [mine, setMine] = useState([]);
  const [openTicket, setOpenTicket] = useState(null);
  const [loading, setLoading] = useState(true);

  // Deep-link context: a booking detail page can link to
  // /support?booking=42&category=billing&subject=...&body=...
  // and the form pre-fills.
  const prefill = {
    related_booking_id: searchParams.get('booking')
      ? Number(searchParams.get('booking'))
      : null,
    related_tutor_id: searchParams.get('tutor')
      ? Number(searchParams.get('tutor'))
      : null,
    category: searchParams.get('category') || 'other',
    subject: searchParams.get('subject') || '',
    body: searchParams.get('body') || '',
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await client.get('/support/tickets/mine');
      setMine(res.data || []);
    } catch {
      // Empty list is fine — user just hasn't opened anything.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadList();
  }, [token, navigate]);

  useEffect(() => {
    if (!ticketId) {
      setOpenTicket(null);
      return;
    }
    (async () => {
      try {
        const res = await client.get(`/support/tickets/${ticketId}`);
        setOpenTicket(res.data);
      } catch {
        setOpenTicket(null);
      }
    })();
  }, [ticketId]);

  if (openTicket) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TicketDetail ticket={openTicket} onBack={() => navigate('/support')} />
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-kotoba-primary">Support</h1>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Get help from the Kotobaseed team. Reply on existing tickets or open a new one.
        </p>
      </header>

      <NewTicketForm
        prefill={prefill}
        onCreated={(ticket) => {
          loadList();
          navigate(`/support/${ticket.id}`);
        }}
      />

      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-3">Your tickets</h2>
        {loading ? (
          <p className="text-sm text-kotoba-text/70">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="text-sm text-kotoba-text/70">
            You haven't opened any tickets yet.
          </p>
        ) : (
          <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
            {mine.map((t) => (
              <li key={t.id} className="px-3 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-grow">
                  <Link
                    to={`/support/${t.id}`}
                    className="font-medium text-kotoba-primary hover:underline"
                  >
                    {t.subject}
                  </Link>
                  <p className="text-xs text-kotoba-text/60 mt-0.5">
                    Last activity {formatWhen(t.last_activity_at)} · #{t.id}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
};

export default Support;
