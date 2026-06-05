import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

// Dashboard module: list of all the tutor's articles (drafts + published)
// with quick edit/publish/delete shortcuts. Full editing happens on the
// dedicated /dashboard/articles/:slug/edit page.

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
};

const ArticlesManager = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/articles/all');
      setArticles(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load your articles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const togglePublish = async (article) => {
    setBusy(article.id);
    setError('');
    try {
      await client.patch(`/articles/${article.id}`, {
        is_published: !article.is_published,
      });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not change publish state.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Articles</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Blog posts, lesson notes, free resources — anything you want students and search engines to find on your site. Saved articles appear at <code className="font-mono text-xs">/articles</code> when published.
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

      {loading ? (
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      ) : articles.length === 0 ? (
        <div className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          You haven't written any articles yet. <Link to="/dashboard/articles/new" className="text-kotoba-primary font-medium">Start your first one</Link> — share a free intro lesson, a study tip, or a culture note to attract students.
        </div>
      ) : (
        <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
          {articles.map((a) => (
            <li
              key={a.id}
              className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
            >
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
                </div>
                <div className="text-xs text-kotoba-text/60 mt-1">
                  {a.is_published && a.published_at
                    ? `Published ${formatDate(a.published_at)}`
                    : `Last edited ${formatDate(a.updated_at)}`}
                  {' · '}
                  <code className="font-mono">/articles/{a.slug}</code>
                </div>
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
