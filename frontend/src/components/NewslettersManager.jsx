import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Per-tutor newsletter compose + history. Two panes: top is the compose
// form (drafts + editing one); below is a list of past sends + current
// drafts. No rich editor — markdown textarea with the same subset the
// transactional emails support (paragraphs / bold / italic / links).

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const NewslettersManager = () => {
  const [items, setItems] = useState([]);
  const [audienceCount, setAudienceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | {id, subject, body_markdown, status, ...}
  const [busy, setBusy] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [previewHtml, setPreviewHtml] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [list, count] = await Promise.all([
        client.get('/tutor/newsletters'),
        client.get('/tutor/newsletters/audience-count'),
      ]);
      setItems(list.data || []);
      setAudienceCount(count.data?.count ?? 0);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load newsletters.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startCompose = () => {
    setEditing({ id: null, subject: '', body_markdown: '', status: 'draft' });
    setInfo('');
    setPreviewHtml(null);
  };

  const startEdit = (item) => {
    setEditing({ ...item });
    setInfo('');
    setPreviewHtml(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setPreviewHtml(null);
    setInfo('');
    setError('');
  };

  const handleSave = async () => {
    if (!editing.subject.trim()) {
      setError('Add a subject line first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let saved;
      if (editing.id) {
        const res = await client.patch(`/tutor/newsletters/${editing.id}`, {
          subject: editing.subject,
          body_markdown: editing.body_markdown,
        });
        saved = res.data;
      } else {
        const res = await client.post('/tutor/newsletters', {
          subject: editing.subject,
          body_markdown: editing.body_markdown,
        });
        saved = res.data;
      }
      setEditing(saved);
      setInfo('Draft saved.');
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    if (!editing.id) {
      setError('Save the draft first to generate a preview.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await client.post(`/tutor/newsletters/${editing.id}/preview`);
      setPreviewHtml(res.data?.body_html ?? '');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not preview.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendTest = async () => {
    if (!editing.id) {
      setError('Save the draft first.');
      return;
    }
    if (!testEmail.trim()) {
      setError('Enter a test recipient email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await client.post(`/tutor/newsletters/${editing.id}/test`, {
        recipient_email: testEmail.trim(),
      });
      setInfo(`Test sent to ${testEmail.trim()}.`);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not send test.');
    } finally {
      setBusy(false);
    }
  };

  const handleBroadcast = async () => {
    if (!editing.id) {
      setError('Save the draft first.');
      return;
    }
    const msg = `Send this newsletter to ${audienceCount} ${audienceCount === 1 ? 'student' : 'students'}? This can't be undone.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError('');
    try {
      const res = await client.post(`/tutor/newsletters/${editing.id}/send`);
      setEditing(res.data);
      setInfo(`Sent to ${res.data.recipient_count} ${res.data.recipient_count === 1 ? 'student' : 'students'}.`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete the draft "${item.subject}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await client.delete(`/tutor/newsletters/${item.id}`);
      if (editing?.id === item.id) cancelEdit();
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not delete.');
    } finally {
      setBusy(false);
    }
  };

  const isSent = editing?.status === 'sent';

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Newsletter</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Send markdown updates to <strong>{audienceCount}</strong> {audienceCount === 1 ? 'student' : 'students'} who've booked with you. Recipients can unsubscribe with one click from any email.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startCompose}
            className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
          >
            + Compose
          </button>
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

      {editing && (
        <div className="border border-kotoba-text/15 rounded-lg p-4 mb-4 bg-kotoba-background/20 space-y-3">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Subject</label>
            <input
              type="text"
              value={editing.subject}
              onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              disabled={busy || isSent}
              maxLength={200}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary disabled:bg-kotoba-background"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Body (markdown)</label>
            <textarea
              value={editing.body_markdown}
              onChange={(e) => setEditing({ ...editing, body_markdown: e.target.value })}
              rows={10}
              disabled={busy || isSent}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary disabled:bg-kotoba-background"
            />
            <p className="mt-1 text-xs text-kotoba-text/60">
              Markdown supported: <code className="font-mono">**bold**</code>, <code className="font-mono">*italic*</code>, <code className="font-mono">[link](https://...)</code>. Each paragraph goes between blank lines.
            </p>
          </div>

          {previewHtml !== null && (
            <div className="border border-kotoba-text/15 rounded-lg overflow-hidden">
              <div className="bg-kotoba-background px-4 py-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-kotoba-text/60">Preview</p>
                <button
                  type="button"
                  onClick={() => setPreviewHtml(null)}
                  className="text-kotoba-text/60 hover:text-kotoba-text text-lg"
                  aria-label="Close preview"
                >
                  ×
                </button>
              </div>
              <div
                className="bg-white p-4 text-sm prose max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}

          {!isSent && (
            <div className="flex items-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
              >
                {busy ? 'Working…' : editing.id ? 'Save draft' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={busy || !editing.id}
                className="px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary hover:text-white disabled:opacity-50 transition-colors"
              >
                Preview
              </button>
              <div className="flex items-end gap-1 ml-auto">
                <div>
                  <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
                    Send test to
                  </label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="me@example.com"
                    disabled={busy || !editing.id}
                    className="w-48 px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={busy || !editing.id || !testEmail.trim()}
                  className="px-3 py-2 text-sm rounded-md border border-kotoba-text/20 text-kotoba-text hover:bg-kotoba-background disabled:opacity-50"
                >
                  Send test
                </button>
              </div>
            </div>
          )}

          {!isSent && (
            <div className="flex items-center justify-between pt-3 border-t border-kotoba-text/10">
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm text-kotoba-text/60 hover:text-kotoba-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBroadcast}
                disabled={busy || !editing.id || audienceCount === 0}
                className="px-5 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-bold hover:bg-kotoba-secondary-dark disabled:opacity-50"
              >
                Send to {audienceCount} {audienceCount === 1 ? 'student' : 'students'}
              </button>
            </div>
          )}

          {isSent && (
            <div className="text-sm text-kotoba-text/70 bg-kotoba-primary/5 rounded-md p-3">
              Sent {formatDate(editing.sent_at)} to {editing.recipient_count} {editing.recipient_count === 1 ? 'student' : 'students'}. Sent newsletters can't be edited — to send something similar, compose a new one.
              <div className="mt-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-sm text-kotoba-text/70 hover:text-kotoba-text underline"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      ) : items.length === 0 && !editing ? (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No newsletters yet. Send a quick update about your availability, a new lesson series, or just say hi — students who've booked with you are the warmest possible audience.
        </p>
      ) : (
        items.length > 0 && (
          <ul className="divide-y divide-kotoba-text/10">
            {items.map((n) => (
              <li key={n.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-grow">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => startEdit(n)}
                      className="font-medium text-kotoba-primary hover:underline truncate text-left"
                    >
                      {n.subject || '(no subject)'}
                    </button>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        n.status === 'sent'
                          ? 'bg-kotoba-primary/15 text-kotoba-primary'
                          : 'bg-kotoba-text/10 text-kotoba-text/70'
                      }`}
                    >
                      {n.status === 'sent' ? 'Sent' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-kotoba-text/60 mt-1">
                    {n.status === 'sent'
                      ? `Sent ${formatDate(n.sent_at)} · ${n.recipient_count} ${n.recipient_count === 1 ? 'student' : 'students'}`
                      : `Last edited ${formatDate(n.updated_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(n)}
                    className="text-sm text-kotoba-primary hover:underline"
                  >
                    {n.status === 'sent' ? 'View' : 'Edit'}
                  </button>
                  {n.status !== 'sent' && (
                    <button
                      type="button"
                      onClick={() => handleDelete(n)}
                      disabled={busy}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
};

export default NewslettersManager;
