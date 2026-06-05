import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Dashboard module for editing transactional email subjects + markdown
// bodies. Each template shows: label + description, current subject,
// current body, the placeholders the tutor can use as chips, Save button,
// "Revert to default" button when an override exists, and a Preview
// button that renders the (unsaved) edit with sample data in an iframe.

const PlaceholderChip = ({ name, onClick }) => (
  <button
    type="button"
    onClick={() => onClick(name)}
    title={`Insert {${name}}`}
    className="px-2 py-0.5 rounded bg-kotoba-secondary/30 text-xs font-mono text-kotoba-text hover:bg-kotoba-secondary/60"
  >
    {`{${name}}`}
  </button>
);

const TemplateEditor = ({ template, onChange, onSave, onRevert, onPreview }) => {
  const subjectRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewSubject, setPreviewSubject] = useState(null);

  const insertPlaceholderInto = (refName, name) => {
    const ref = refName === 'subject' ? subjectRef : bodyRef;
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const token = `{${name}}`;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    onChange({
      ...template,
      [refName]: next,
    });
    // Restore caret after React re-renders.
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await onSave(template);
      setInfo('Saved.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = async () => {
    if (!window.confirm(`Revert "${template.label}" to the platform default? Your custom version will be discarded.`)) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await onRevert(template.key);
      setInfo('Reverted to default.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not revert.');
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await onPreview(template);
      setPreviewSubject(res.subject);
      setPreviewHtml(res.body_html);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not preview.');
    } finally {
      setBusy(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewHtml(null);
    setPreviewSubject(null);
  };

  return (
    <div className="border border-kotoba-text/10 rounded-lg p-4 bg-kotoba-background/30">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <h3 className="font-semibold text-kotoba-primary">{template.label}</h3>
          <p className="text-xs text-kotoba-text/60">{template.description}</p>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            template.is_overridden
              ? 'bg-kotoba-primary/15 text-kotoba-primary'
              : 'bg-kotoba-text/10 text-kotoba-text/60'
          }`}
        >
          {template.is_overridden ? 'Customized' : 'Platform default'}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm mb-2">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-kotoba-primary/10 text-kotoba-primary px-3 py-2 rounded-md text-sm mb-2">
          {info}
        </div>
      )}

      <div className="mb-3">
        <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
          Subject line
        </label>
        <input
          ref={subjectRef}
          type="text"
          value={template.subject}
          onChange={(e) => onChange({ ...template, subject: e.target.value })}
          disabled={busy}
          className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
        />
        <div className="mt-1 flex flex-wrap gap-1">
          {template.placeholders.map((p) => (
            <PlaceholderChip key={p} name={p} onClick={(n) => insertPlaceholderInto('subject', n)} />
          ))}
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
          Email body (markdown)
        </label>
        <textarea
          ref={bodyRef}
          value={template.body_markdown}
          onChange={(e) => onChange({ ...template, body_markdown: e.target.value })}
          rows={10}
          disabled={busy}
          className="w-full px-3 py-2 border border-kotoba-text/20 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
        />
        <div className="mt-1 flex flex-wrap gap-1">
          {template.placeholders.map((p) => (
            <PlaceholderChip key={p} name={p} onClick={(n) => insertPlaceholderInto('body_markdown', n)} />
          ))}
        </div>
        <p className="mt-1 text-xs text-kotoba-text/60">
          Markdown supported: <code className="font-mono">**bold**</code>, <code className="font-mono">*italic*</code>, <code className="font-mono">[link](https://...)</code>. Click a chip above to drop a placeholder where your cursor is.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={busy}
          className="px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary hover:text-white disabled:opacity-50 transition-colors"
        >
          Preview
        </button>
        {template.is_overridden && (
          <button
            type="button"
            onClick={handleRevert}
            disabled={busy}
            className="px-4 py-2 text-sm text-kotoba-text/60 hover:text-red-700"
          >
            Revert to default
          </button>
        )}
      </div>

      {previewHtml !== null && (
        <div className="mt-4 border border-kotoba-text/15 rounded-lg overflow-hidden">
          <div className="bg-kotoba-background px-4 py-2 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-kotoba-text/60">Preview · sample data</p>
              <p className="text-sm font-medium text-kotoba-text">{previewSubject}</p>
            </div>
            <button
              type="button"
              onClick={handleClosePreview}
              className="text-kotoba-text/60 hover:text-kotoba-text text-lg"
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
          <div
            className="bg-white p-4 text-sm prose max-w-none"
            // The preview comes from our markdown renderer which escapes
            // raw HTML before applying inline transforms, so injection is
            // already neutralized — we just render the result.
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      )}
    </div>
  );
};

const EmailTemplatesManager = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/email-templates');
      setTemplates(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateLocal = (next) => {
    setTemplates((arr) => arr.map((t) => (t.key === next.key ? next : t)));
  };

  const save = async (template) => {
    const res = await client.put(`/tutor/email-templates/${template.key}`, {
      subject: template.subject,
      body_markdown: template.body_markdown,
    });
    updateLocal(res.data);
  };

  const revert = async (key) => {
    await client.delete(`/tutor/email-templates/${key}`);
    await load();
  };

  const preview = async (template) => {
    const res = await client.post(
      `/tutor/email-templates/${template.key}/preview`,
      {
        subject: template.subject,
        body_markdown: template.body_markdown,
      }
    );
    return res.data;
  };

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Email customization</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-kotoba-primary">Email customization</h2>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Edit the transactional emails your students receive so they sound like you. Anything you don't touch keeps the friendly platform default.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm mb-3">
          {error}
        </div>
      )}

      <ul className="space-y-2">
        {templates.map((t) => {
          const isOpen = expanded === t.key;
          return (
            <li key={t.key} className="border border-kotoba-text/10 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : t.key)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 bg-white hover:bg-kotoba-background/30 text-left"
              >
                <div>
                  <p className="font-medium text-kotoba-text">{t.label}</p>
                  <p className="text-xs text-kotoba-text/60">{t.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      t.is_overridden
                        ? 'bg-kotoba-primary/15 text-kotoba-primary'
                        : 'bg-kotoba-text/10 text-kotoba-text/60'
                    }`}
                  >
                    {t.is_overridden ? 'Customized' : 'Default'}
                  </span>
                  <span className="text-kotoba-text/50 text-sm">{isOpen ? '−' : '+'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-kotoba-text/10 p-4">
                  <TemplateEditor
                    template={t}
                    onChange={updateLocal}
                    onSave={save}
                    onRevert={revert}
                    onPreview={preview}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default EmailTemplatesManager;
