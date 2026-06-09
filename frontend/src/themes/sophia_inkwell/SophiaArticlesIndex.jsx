import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight, FaRegFileLines } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

// SophiaArticlesIndex — themed `/articles` listing for Sophia's tenant.
// Mirrors DafniArticlesIndex's backend integration exactly: pulls the
// article list from `/articles` (already tenant-scoped) and renders
// each row as a stacked editorial card. Visual treatment is the
// Inkwell pack — bone surfaces, navy accent rule, Playfair titles.

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

const SophiaArticlesIndex = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [articles, setArticles] = useState(null);
  const [error, setError] = useState(null);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

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
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Journal — English with ${firstName}`}
    >
      <main className="s-content">
        <p className="s-eyebrow-inline">
          <FaRegFileLines size={14} /> Journal
        </p>
        <h1 className="s-pt">{firstName}'s notes</h1>
        <p className="s-pt-sub">
          Lesson reflections, grammar walk-throughs, and the small language
          details that make English feel less foreign.
        </p>

        {error && <p className="s-form-error">{error}</p>}
        {articles === null && <div className="s-empty">Loading…</div>}
        {articles && articles.length === 0 && !error && (
          <div className="s-empty">No articles yet. Check back soon.</div>
        )}

        {articles && articles.map((a) => (
          <Link
            key={a.id || a.slug}
            to={`/articles/${a.slug}`}
            className="s-article-card"
          >
            <h2 className="s-article-card-title">{a.title}</h2>
            {a.summary && (
              <p className="s-article-card-summary">{a.summary}</p>
            )}
            <div className="s-article-card-meta">
              <span>{fmtDate(a.published_at) || ''}</span>
              <span className="s-article-card-read">
                Read <FaArrowRight size={13} />
              </span>
            </div>
          </Link>
        ))}
      </main>
    </SophiaLayout>
  );
};

export default SophiaArticlesIndex;
