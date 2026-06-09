import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useToast } from '../context/ToastContext';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

// Dashboard module: tutor's articles with text search + status filter +
// visibility filter so a tutor with a long backlog can find what they're
// looking for. Full editing happens on the dedicated page.

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
};

const VISIBILITY_LABEL = {
  public: 'Public',
  subscribers_only: 'Subscribers only',
  module_only: 'Module content',
};

const VISIBILITY_TONE = {
  public: 'bg-kotoba-background text-kotoba-text/70',
  subscribers_only: 'bg-kotoba-secondary/30 text-kotoba-text',
  module_only: 'bg-kotoba-primary/15 text-kotoba-primary',
};

const ArticlesManager = () => {
  const { addToast } = useToast();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | published | draft
  const [visibilityFilter, setVisibilityFilter] = useState('all'); // all | public | subscribers_only | module_only

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/articles/all');
      setArticles(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your articles.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const togglePublish = async (article) => {
    setBusy(article.id);
    setError('');
    const wasPublished = article.is_published;
    try {
      await client.patch(`/articles/${article.id}`, {
        is_published: !wasPublished,
      });
      await load();
      addToast({
        message: wasPublished
          ? `Unpublished "${article.title}".`
          : `Published "${article.title}".`,
        type: 'success',
        undo: {
          onUndo: async () => {
            try {
              await client.patch(`/articles/${article.id}`, {
                is_published: wasPublished,
              });
              await load();
            } catch (err) {
              setError(getErrorMessage(err, 'Undo failed.'));
            }
          },
        },
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change publish state.'));
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles.filter((a) => {
      if (statusFilter === 'published' && !a.is_published) return false;
      if (statusFilter === 'draft' && a.is_published) return false;
      if (visibilityFilter !== 'all' && a.visibility !== visibilityFilter) return false;
      if (q && !a.title.toLowerCase().includes(q) && !(a.summary || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [articles, search, statusFilter, visibilityFilter]);

  const counts = useMemo(() => ({
    total: articles.length,
    published: articles.filter((a) => a.is_published).length,
    drafts: articles.filter((a) => !a.is_published).length,
  }), [articles]);

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">
            Articles {counts.total > 0 && <span className="text-sm font-normal text-kotoba-text/60">· {counts.total} total · {counts.published} published · {counts.drafts} draft{counts.drafts === 1 ? '' : 's'}</span>}
          </h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Blog posts, lesson notes, free resources — anything you want students and search engines to find. Use the visibility setting to mark articles as subscribers-only or module-only.
          </p>
        </div>
        <Link
          to="/dashboard/articles/new"
          className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
        >
          + New article
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm mb-3">
          {error}
        </div>
      )}

      {articles.length > 0 && (
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 mb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or summary…"
            className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          >
            <option value="all">All status</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
          <select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value)}
            className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          >
            <option value="all">All visibility</option>
            <option value="public">Public</option>
            <option value="subscribers_only">Subscribers only</option>
            <option value="module_only">Module content</option>
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      ) : articles.length === 0 ? (
        <div className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          You haven't written any articles yet. <Link to="/dashboard/articles/new" className="text-kotoba-primary font-medium">Start your first one</Link> — share a free intro lesson, a study tip, or a culture note to attract students.
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No articles match those filters. <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); setVisibilityFilter('all'); }} className="text-kotoba-primary hover:underline">Reset filters</button>
        </p>
      ) : (
        <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
          {filtered.map((a) => (
            <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/dashboard/articles/${a.slug}/edit`}
                    className="font-medium text-kotoba-primary hover:underline truncate"
                  >
                    {a.title}
                  </Link>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      a.is_published
                        ? 'bg-kotoba-primary/15 text-kotoba-primary'
                        : 'bg-kotoba-text/10 text-kotoba-text/70'
                    }`}
                  >
                    {a.is_published ? 'Published' : 'Draft'}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${VISIBILITY_TONE[a.visibility] || VISIBILITY_TONE.public}`}>
                    {VISIBILITY_LABEL[a.visibility] || a.visibility}
                  </span>
                </div>
                <div className="text-xs text-kotoba-text/60 mt-1">
                  {a.is_published && a.published_at
                    ? `Published ${formatDate(a.published_at)}`
                    : `Last edited ${formatDate(a.updated_at)}`}
                  {' · '}
                  <code className="font-mono">/articles/{a.slug}</code>
                </div>
                {a.summary && (
                  <p className="text-xs text-kotoba-text/70 mt-1 truncate">{a.summary}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => togglePublish(a)}
                  disabled={busy === a.id}
                  className="text-sm text-kotoba-text/70 hover:text-kotoba-primary disabled:opacity-50"
                >
                  {a.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <Link
                  to={`/dashboard/articles/${a.slug}/edit`}
                  className="text-sm text-kotoba-primary hover:underline"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ArticlesManager;
