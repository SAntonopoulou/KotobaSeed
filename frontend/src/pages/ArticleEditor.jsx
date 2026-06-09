import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import MarkdownEditor from '../components/editor/MarkdownEditor';
import { getErrorMessage } from '../utils/errors';

// Full-page article editor used for both `/dashboard/articles/new` and
// `/dashboard/articles/:slug/edit`. Saves body_markdown + lexical_json
// together. The editor's onChange runs on every keystroke, but we only
// hit the API on explicit save.

const ArticleEditor = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { addToast } = useToast();
  const { slug } = useParams();
  const isNew = !slug;

  const [articleId, setArticleId] = useState(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [slugDraft, setSlugDraft] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [lexicalJson, setLexicalJson] = useState(null);
  const [previewMarkdown, setPreviewMarkdown] = useState('');
  // Piecemeal price for non-Plus students. Stored as a euro string
  // so the input stays user-friendly; converted to cents on save.
  const [priceEuro, setPriceEuro] = useState('');
  const [initialBody, setInitialBody] = useState('');
  const [initialLexical, setInitialLexical] = useState(null);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get(`/articles/${slug}/draft`);
        if (cancelled) return;
        const a = res.data;
        setArticleId(a.id);
        setTitle(a.title);
        setSummary(a.summary || '');
        setSlugDraft(a.slug);
        setIsPublished(a.is_published);
        setVisibility(a.visibility || 'public');
        setCommentsEnabled(Boolean(a.comments_enabled));
        setInitialBody(a.body_markdown || '');
        setInitialLexical(a.lexical_json || null);
        setBodyMarkdown(a.body_markdown || '');
        setLexicalJson(a.lexical_json || null);
        setPreviewMarkdown(a.preview_markdown || '');
        setPriceEuro(a.price_cents ? (a.price_cents / 100).toFixed(2) : '');
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Could not load that article.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, slug]);

  const handleEditorChange = ({ markdown, lexicalJson }) => {
    setBodyMarkdown(markdown);
    setLexicalJson(lexicalJson);
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!title.trim()) {
      setError('Give your article a title.');
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const parsedPrice = parseFloat(priceEuro || '0');
      const priceCents =
        Number.isFinite(parsedPrice) && parsedPrice > 0
          ? Math.round(parsedPrice * 100)
          : 0;
      const payload = {
        title: title.trim(),
        summary: summary.trim() || null,
        body_markdown: bodyMarkdown,
        lexical_json: lexicalJson,
        preview_markdown: previewMarkdown.trim() || null,
        price_cents: priceCents,
        comments_enabled: commentsEnabled,
        is_published: isPublished,
        visibility,
      };
      // Only send a slug on update if the tutor changed it — otherwise the
      // server keeps the existing slug rather than reslugifying the title.
      if (!isNew && slugDraft) {
        payload.slug = slugDraft;
      }
      if (isNew) {
        const res = await client.post('/articles', payload);
        const next = res.data?.slug;
        setInfo('Saved.');
        if (next) {
          navigate(`/dashboard/articles/${next}/edit`, { replace: true });
        }
      } else {
        const res = await client.patch(`/articles/${articleId}`, payload);
        if (res.data?.slug) setSlugDraft(res.data.slug);
        setInfo('Saved.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!articleId) return;
    if (!(await confirm({
      title: 'Delete article',
      message: 'Move this article to the bin? You can undo from the toast.',
      confirmText: 'Delete',
      destructive: true,
    }))) return;
    setSaving(true);
    const deletedId = articleId;
    const deletedTitle = title || 'article';
    try {
      await client.delete(`/articles/${deletedId}`);
      addToast({
        message: `Deleted "${deletedTitle}".`,
        type: 'success',
        undo: {
          onUndo: async () => {
            try {
              await client.post(`/articles/${deletedId}/restore`);
              navigate(`/dashboard/articles/${slug}/edit`);
            } catch (err) {
              console.error('restore failed', err);
            }
          },
        },
      });
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete.'));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center">
        <p className="text-kotoba-text">Loading…</p>
      </div>
    );
  }

  return (
    <div className="bg-kotoba-background min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link to="/dashboard" className="text-sm text-kotoba-text/70 hover:text-kotoba-primary">
              ← Back to dashboard
            </Link>
            <h1 className="text-xl font-semibold text-kotoba-primary mt-1">
              {isNew ? 'New article' : 'Edit article'}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm">
              <span className="text-kotoba-text/70">Visibility:</span>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="px-2 py-1 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              >
                <option value="public">Public (in articles feed)</option>
                <option value="subscribers_only">Subscribers only</option>
                <option value="module_only">Module content only</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
              />
              Published
            </label>
            <label
              className="inline-flex items-center gap-2 text-sm"
              title="Let signed-in readers comment under this article. You can moderate (hide) any individual comment from the reader page."
            >
              <input
                type="checkbox"
                checked={commentsEnabled}
                onChange={(e) => setCommentsEnabled(e.target.checked)}
                className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
              />
              Comments on
            </label>
            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="text-sm text-kotoba-text/60 hover:text-red-600"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
            >
              {saving ? 'Saving…' : isNew ? 'Save draft' : 'Save'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm">
            {info}
          </div>
        )}

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Article title"
          className="w-full text-3xl font-bold text-kotoba-primary bg-transparent border-0 border-b border-kotoba-text/15 focus:outline-none focus:border-kotoba-primary py-2"
          data-tour="article-title-input"
        />

        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Short summary (shown on the article list)"
          className="w-full text-base text-kotoba-text/80 bg-transparent border border-kotoba-text/15 rounded-md px-3 py-2 focus:outline-none focus:border-kotoba-primary"
        />

        {!isNew && (
          <div className="flex items-center gap-2 text-sm">
            <label className="text-kotoba-text/70 font-medium" htmlFor="slug">
              URL slug:
            </label>
            <input
              id="slug"
              type="text"
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value)}
              className="flex-grow font-mono text-sm bg-transparent border border-kotoba-text/15 rounded px-2 py-1 focus:outline-none focus:border-kotoba-primary"
            />
          </div>
        )}

        {visibility === 'subscribers_only' && (
          <div className="rounded-lg border border-kotoba-primary/20 bg-kotoba-primary/5 p-4 space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <label
                  htmlFor="preview_markdown"
                  className="text-sm font-semibold text-kotoba-primary"
                >
                  Preview for non-subscribers
                </label>
                <span className="text-xs text-kotoba-text/60">
                  Optional · falls back to the first 200 words of your article if left blank
                </span>
              </div>
              <textarea
                id="preview_markdown"
                value={previewMarkdown}
                onChange={(e) => setPreviewMarkdown(e.target.value)}
                rows={4}
                placeholder="Write a hook — 2–3 paragraphs that make a prospect want to subscribe. Plain or markdown is fine."
                className="mt-1 w-full text-sm text-kotoba-text bg-white border border-kotoba-text/15 rounded-md px-3 py-2 focus:outline-none focus:border-kotoba-primary"
                maxLength={10000}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <label
                  htmlFor="price_euro"
                  className="text-sm font-semibold text-kotoba-primary"
                >
                  Piecemeal price for Free students
                </label>
                <span className="text-xs text-kotoba-text/60">
                  Leave blank or 0 to make this Plus-only
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-kotoba-text/70">€</span>
                <input
                  id="price_euro"
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceEuro}
                  onChange={(e) => setPriceEuro(e.target.value)}
                  placeholder="2.50"
                  className="w-32 text-sm text-kotoba-text bg-white border border-kotoba-text/15 rounded-md px-3 py-2 focus:outline-none focus:border-kotoba-primary"
                />
                <span className="text-xs text-kotoba-text/60">
                  Kotobaseed keeps 10%. You receive {' '}
                  {priceEuro && parseFloat(priceEuro) > 0
                    ? `€${(parseFloat(priceEuro) * 0.9).toFixed(2)}`
                    : '€0.00'}{' '}
                  per sale.
                </span>
              </div>
              <p className="mt-2 text-xs text-kotoba-text/60">
                Plus subscribers always read this for free. Their reads earn you a share of the monthly creator pool instead — see your dashboard for earnings.
              </p>
            </div>
          </div>
        )}

        {visibility === 'module_only' && (
          <div className="rounded-lg border border-kotoba-secondary/40 bg-kotoba-secondary/15 p-4 space-y-2">
            <p className="text-sm font-semibold text-kotoba-secondary-dark">
              Module-exclusive — hidden from the regular articles feed
            </p>
            <p className="text-sm text-kotoba-text/80 leading-relaxed">
              This article won't appear on your public articles list or in the apex
              discovery feed. It's only readable as a numbered item inside a paid lesson
              module you've added it to.
            </p>
            <ul className="text-xs text-kotoba-text/70 list-disc list-inside space-y-1">
              <li>
                Use this for module workbooks, lesson scripts, drill explainers — content
                that only makes sense inside a curriculum.
              </li>
              <li>
                Buyers of the parent module read it for free. Plus subscribers also have
                access (Plus unlocks every tutor's premium content).
              </li>
              <li>
                Add the article to a module from <strong>Dashboard → Modules</strong>,
                then mark it as a free preview if you want non-buyers to sample it.
              </li>
            </ul>
          </div>
        )}

        <MarkdownEditor
          initialMarkdown={initialBody}
          initialLexicalJson={initialLexical}
          onChange={handleEditorChange}
        />

        <p className="text-xs text-kotoba-text/60">
          Tip: type <code className="font-mono">## </code> for a heading, <code className="font-mono">**bold**</code> for bold, etc. Hit the <strong>Vocab</strong> button to add a clickable tooltip for a word in the language you teach — students hover to see the translation.
        </p>
      </main>
    </div>
  );
};

export default ArticleEditor;
