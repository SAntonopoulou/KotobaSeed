import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight, FaRegFileLines } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import DafniLayout from './DafniLayout';
import './dafni_botanical.css';

// DafniArticlesIndex — themed `/articles` listing for Dafni's tenant.
// Mirrors VassoArticlesIndex's backend integration exactly: pulls the
// article list from `/articles` (already tenant-scoped) and renders
// each row as a stacked editorial card. Visual treatment is Dafni's
// warm botanical pack — cream surfaces, terracotta accent rule,
// Fraunces titles, sage hairline dividers.

const fmtDate = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return null;
  }
};

const DafniArticlesIndex = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [articles, setArticles] = useState(null);
  const [error, setError] = useState(null);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Dafni';

  useEffect(() => {
    let cancelled = false;
    client
      .get('/articles')
      .then((res) => {
        if (cancelled) return;
        setArticles(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Could not load articles');
        setArticles([]);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <DafniLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Journal — Learn with ${firstName}`}
    >
      <main className="d-content">
        <p className="d-eyebrow-inline">
          <FaRegFileLines size={14} /> Journal
        </p>
        <h1 className="d-pt">{firstName}'s notes</h1>
        <p className="d-pt-sub">
          Lesson reflections, grammar walk-throughs, and the small cultural
          details that make a language come alive.
        </p>

        {error && <p className="d-form-error">{error}</p>}
        {articles === null && <div className="d-empty">Loading…</div>}
        {articles && articles.length === 0 && !error && (
          <div className="d-empty">No articles yet. Check back soon.</div>
        )}

        {articles && articles.map((a) => (
          <Link
            key={a.id || a.slug}
            to={`/articles/${a.slug}`}
            className="d-article-card"
          >
            <h2 className="d-article-card-title">{a.title}</h2>
            {a.summary && (
              <p className="d-article-card-summary">{a.summary}</p>
            )}
            <div className="d-article-card-meta">
              <span>{fmtDate(a.published_at) || ''}</span>
              <span className="d-article-card-read">
                Read <FaArrowRight size={13} />
              </span>
            </div>
          </Link>
        ))}
      </main>
    </DafniLayout>
  );
};

export default DafniArticlesIndex;
