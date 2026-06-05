import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { apexUrl } from '../hooks/useTenant';

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
};

const ArticlesIndex = () => {
  const [articles, setArticles] = useState([]);
  const [tutor, setTutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [arts, t] = await Promise.all([
          client.get('/articles'),
          client.get('/tutor/me'),
        ]);
        setArticles(arts.data || []);
        setTutor(t.data || null);
      } catch (err) {
        setError(err?.response?.data?.detail || 'Could not load articles.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="bg-kotoba-background min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a
              href={apexUrl('/')}
              className="text-xs uppercase tracking-wider text-kotoba-text/50 hover:text-kotoba-primary"
            >
              Kotobaseed
            </a>
            <span className="text-kotoba-text/30">·</span>
            <Link to="/" className="text-xl font-semibold text-kotoba-primary hover:underline">
              {tutor?.display_name || 'Tutor'}
            </Link>
          </div>
          <Link
            to="/"
            className="text-sm text-kotoba-text/70 hover:text-kotoba-primary"
          >
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-extrabold text-kotoba-primary mb-8">Articles</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-kotoba-text">Loading…</p>
        ) : articles.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-kotoba-text/70">
              No articles published yet. Check back soon.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {articles.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/articles/${a.slug}`}
                  className="block bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-6 no-underline"
                >
                  <p className="text-xs uppercase tracking-wider text-kotoba-text/60">
                    {formatDate(a.published_at)}
                  </p>
                  <h2 className="text-xl font-bold text-kotoba-primary mt-1">{a.title}</h2>
                  {a.summary && (
                    <p className="mt-2 text-kotoba-text/80">{a.summary}</p>
                  )}
                  <p className="mt-3 text-sm font-medium text-kotoba-primary">
                    Read article →
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default ArticlesIndex;
