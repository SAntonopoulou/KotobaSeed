import React, { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/dates';
import MarkdownEditor from './editor/MarkdownEditor';

// Per-tutor newsletter compose + history. Two panes: top is the compose
// form (drafts + editing one); below is a list of past sends + current
// drafts. Markdown body with inline image upload + starter templates so
// tutors aren't staring at an empty box.

const STARTER_TEMPLATES = {
  welcome: {
    subject: 'Welcome — here are a few things to get you started',
    body: `Hi there,

I'm so glad you signed up. Here are a few things to know:

- **Where to start:** the Journal has my latest posts, and a few free pieces to give you a feel.
- **What to expect:** a short note from me every couple of weeks — a thought, a phrase I love, sometimes a recommendation.
- **One favour:** hit reply and tell me where you are in your learning. It helps me write things that actually help.

Talk soon,
`,
  },
  weekly_tip: {
    subject: 'A small thing that makes a big difference',
    body: `Quick note this week.

The trick I use most often with new students:

> **Say the sentence out loud before you write it.**

If your tongue stumbles, your pen will too. Voicing the sentence first lets you catch the awkward bit while it's still easy to fix.

Try it on the next thing you write. Tell me how it goes.

— Your tutor`,
  },
  announcement: {
    subject: "Something new I'm working on",
    body: `Hi,

I wanted to share something new I'm putting together — a [short description].

Here's what's in it:

- Point one
- Point two
- Point three

If that sounds interesting, [link to it](#).

Thanks for reading,
`,
  },
  new_module: {
    subject: 'A new module just went live',
    body: `Hi,

I just published a new module: **[Module name]**.

It covers [what it covers], and it's designed for [who it's for]. There are [N] lessons inside.

[Open it on my site](#)

Let me know what you think — I read every reply.

— Your tutor`,
  },
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
};

const NewslettersManager = () => {
  const confirm = useConfirm();
  const { addToast } = useToast();
  const [items, setItems] = useState([]);
  const [audienceCount, setAudienceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | {id, subject, body_markdown, status, ...}
  const [busy, setBusy] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [previewHtml, setPreviewHtml] = useState(null);
  // Bump this when we need to re-mount MarkdownEditor with new initialMarkdown
  // (e.g. starter template applied, image inserted). The editor is an
  // uncontrolled component — props are only read on first mount.
  const [editorReloadKey, setEditorReloadKey] = useState(0);

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
      setError(getErrorMessage(err, 'Could not load newsletters.'));
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
      setError(getErrorMessage(err, 'Could not save.'));
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
      setError(getErrorMessage(err, 'Could not preview.'));
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
      setError(getErrorMessage(err, 'Could not send test.'));
    } finally {
      setBusy(false);
    }
  };

  const handleBroadcast = async () => {
    if (!editing.id) {
      setError('Save the draft first.');
      return;
    }
    if (!(await confirm({
      title: 'Send newsletter',
      message: `Send this newsletter to ${audienceCount} ${audienceCount === 1 ? 'student' : 'students'}? This can't be undone.`,
      confirmText: 'Send now',
    }))) return;
    setBusy(true);
    setError('');
    try {
      const res = await client.post(`/tutor/newsletters/${editing.id}/send`);
      setEditing(res.data);
      setInfo(`Sent to ${res.data.recipient_count} ${res.data.recipient_count === 1 ? 'student' : 'students'}.`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item) => {
    if (!(await confirm({
      title: 'Delete draft',
      message: `Delete the draft "${item.subject}"? You can undo from the toast.`,
      confirmText: 'Delete',
      destructive: true,
    }))) return;
    setBusy(true);
    setError('');
    try {
      await client.delete(`/tutor/newsletters/${item.id}`);
      if (editing?.id === item.id) cancelEdit();
      await load();
      addToast({
        message: `Deleted draft "${item.subject}".`,
        type: 'success',
        undo: {
          onUndo: async () => {
            try {
              await client.post(`/tutor/newsletters/${item.id}/restore`);
              await load();
            } catch (err) {
              setError(getErrorMessage(err, 'Restore failed.'));
            }
          },
        },
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete.'));
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
            Send markdown updates to <strong>{audienceCount}</strong> {audienceCount === 1 ? 'student' : 'students'} who've booked with you <em>and</em> opted in to Kotobaseed emails at signup. Recipients can unsubscribe with one click from any email.
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
          {!isSent && editing.id == null && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs font-medium text-kotoba-text/70">Start with a template</label>
              <select
                value=""
                onChange={(e) => {
                  const key = e.target.value;
                  if (!key || !STARTER_TEMPLATES[key]) return;
                  const tpl = STARTER_TEMPLATES[key];
                  setEditing((prev) => ({
                    ...prev,
                    subject: tpl.subject,
                    body_markdown: tpl.body,
                  }));
                  setEditorReloadKey((k) => k + 1);
                }}
                disabled={busy}
                className="px-3 py-1.5 text-sm border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              >
                <option value="">— blank —</option>
                <option value="welcome">Welcome (new subscriber)</option>
                <option value="weekly_tip">Weekly tip</option>
                <option value="announcement">Announcement</option>
                <option value="new_module">New module launched</option>
              </select>
            </div>
          )}

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
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <label className="block text-xs font-medium text-kotoba-text/70">Body</label>
              {!isSent && (
                <NewsletterImageUploadButton
                  onInsert={(url) => {
                    setEditing((prev) => {
                      const sep =
                        !prev.body_markdown || prev.body_markdown.endsWith('\n\n')
                          ? ''
                          : prev.body_markdown.endsWith('\n')
                            ? '\n'
                            : '\n\n';
                      return {
                        ...prev,
                        body_markdown: `${prev.body_markdown}${sep}![](${url})\n\n`,
                      };
                    });
                    setEditorReloadKey((k) => k + 1);
                  }}
                  addToast={addToast}
                  busy={busy}
                />
              )}
            </div>
            {isSent ? (
              <div className="border border-kotoba-text/15 rounded-lg p-4 bg-kotoba-background/50 font-mono text-sm whitespace-pre-wrap text-kotoba-text/80">
                {editing.body_markdown || '(empty)'}
              </div>
            ) : (
              <MarkdownEditor
                key={`${editing.id ?? 'new'}-${editorReloadKey}`}
                initialMarkdown={editing.body_markdown}
                enableVocab={false}
                minHeight={260}
                placeholder="Write something your students will be glad to read…"
                onChange={({ markdown }) =>
                  setEditing((prev) =>
                    prev ? { ...prev, body_markdown: markdown } : prev,
                  )
                }
              />
            )}
            <p className="mt-1 text-xs text-kotoba-text/60">
              Use the toolbar above for formatting, or type markdown shortcuts (<code className="font-mono">**bold**</code>, <code className="font-mono">## heading</code>, <code className="font-mono">- list</code>). Sent emails include your name + avatar at the top automatically.
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
          No newsletters yet. Send a quick update about your availability, a new lesson series, or just say hi — students who've booked with you and opted in to email at signup are the warmest possible audience.
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

      <NewsletterPrefsPanel />
    </section>
  );
};


// Inline image upload — opens a file picker, posts to the owner-side
// upload endpoint, and inserts the resulting URL into the markdown
// body via the parent's `onInsert` callback.
const NewsletterImageUploadButton = ({ onInsert, addToast, busy }) => {
  const ref = useRef(null);
  const [uploading, setUploading] = useState(false);
  const pickFile = () => {
    if (ref.current) ref.current.click();
  };
  const onChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await client.post(
        '/tutor/newsletters/upload-image',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      if (res.data?.url) {
        onInsert(res.data.url);
        addToast('Image inserted.', 'success');
      }
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not upload the image.'), 'error');
    } finally {
      setUploading(false);
    }
  };
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onChange}
        className="hidden"
        disabled={busy || uploading}
      />
      <button
        type="button"
        onClick={pickFile}
        disabled={busy || uploading}
        className="text-xs px-3 py-1 rounded-md border border-kotoba-text/20 text-kotoba-text hover:bg-kotoba-background disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : '+ Insert image'}
      </button>
    </>
  );
};


// Public-CTA preference panel. Toggles whether the signup form appears
// in the footer and/or as a dedicated card on the tutor's homepage, and
// lets the tutor customise the headline + pitch shown to visitors.
const NewsletterPrefsPanel = () => {
  const { addToast } = useToast();
  const [prefs, setPrefs] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/tutor/newsletters/prefs');
        setPrefs(res.data);
      } catch {
        // Silent — panel just won't render
      }
    })();
  }, []);

  if (!prefs) return null;

  const update = (patch) => setPrefs((p) => ({ ...p, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      const res = await client.patch('/tutor/newsletters/prefs', prefs);
      setPrefs(res.data);
      addToast('Signup preferences saved.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not save preferences.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 border-t border-kotoba-text/10 pt-6">
      <h3 className="text-base font-bold text-kotoba-primary">
        Where the signup form appears
      </h3>
      <p className="text-xs text-kotoba-text/60 mt-1 mb-4">
        Control where visitors to your site see the newsletter signup.
      </p>

      <div className="space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.newsletter_enabled}
            onChange={(e) => update({ newsletter_enabled: e.target.checked })}
            disabled={busy}
            className="mt-1"
          />
          <span>
            <strong>Accept newsletter signups.</strong> Turn this off and the form hides everywhere.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.newsletter_show_in_footer}
            onChange={(e) =>
              update({ newsletter_show_in_footer: e.target.checked })
            }
            disabled={busy || !prefs.newsletter_enabled}
            className="mt-1"
          />
          <span>Show a slim signup form in my site footer (every page).</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.newsletter_show_homepage_section}
            onChange={(e) =>
              update({ newsletter_show_homepage_section: e.target.checked })
            }
            disabled={busy || !prefs.newsletter_enabled}
            className="mt-1"
          />
          <span>
            Show a dedicated signup card near the bottom of my homepage.
          </span>
        </label>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            CTA headline (shown to visitors)
          </label>
          <input
            type="text"
            value={prefs.newsletter_cta_title || ''}
            onChange={(e) =>
              update({ newsletter_cta_title: e.target.value || null })
            }
            disabled={busy || !prefs.newsletter_enabled}
            maxLength={120}
            placeholder="Stay in touch — defaults to your name if left blank"
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary disabled:bg-kotoba-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            Short description
          </label>
          <textarea
            value={prefs.newsletter_cta_description || ''}
            onChange={(e) =>
              update({ newsletter_cta_description: e.target.value || null })
            }
            disabled={busy || !prefs.newsletter_enabled}
            maxLength={400}
            rows={2}
            placeholder="A one-liner about what visitors get if they subscribe"
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary disabled:bg-kotoba-background"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50 text-sm"
        >
          {busy ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
};


export default NewslettersManager;
