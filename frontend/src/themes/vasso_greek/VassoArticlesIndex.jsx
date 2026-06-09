import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight, FaRegFileLines } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

// VassoArticlesIndex — themed `/articles` listing for Vasso's tenant.
// Mirrors the standalone greekvasso ArticlesPage: trimmed sub-page
// header, eyebrow + h1 + sub, then a stack of `.panel` cards. Pulls
// the article list from `/articles` which the tenant API already
// scopes to this tutor.

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

const VassoArticlesIndex = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [articles, setArticles] = useState(null);
  const [error, setError] = useState(null);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Vasso';

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
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="Journal — Learn Greek with Vasso"
    >
      <main className="content">
        <p className="eyebrow-inline">
          <FaRegFileLines size={14} /> Journal
        </p>
        <h1 className="pt">{firstName}'s notes</h1>
        <p className="pt-sub">
          Lesson highlights, pronunciation tips, and bits of Greek culture — written
          for anyone on the journey.
        </p>

        {error && <p className="form-error">{error}</p>}
        {articles === null && <div className="empty">Loading…</div>}
        {articles && articles.length === 0 && !error && (
          <div className="empty">No articles yet. Check back soon.</div>
        )}

        {articles && articles.map((a) => (
          <Link
            key={a.id || a.slug}
            to={`/articles/${a.slug}`}
            className="panel panel-pad"
            style={{ marginBottom: 18 }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 22,
                margin: '0 0 8px',
                letterSpacing: '-0.01em',
                color: 'var(--fg)',
              }}
            >
              {a.title}
            </h2>
            {a.summary && (
              <p style={{
                margin: '0 0 12px',
                color: 'var(--fg-muted)',
                fontSize: 15.5,
                lineHeight: 1.55,
              }}>
                {a.summary}
              </p>
            )}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 13,
              color: 'var(--fg-subtle)',
            }}>
              {fmtDate(a.published_at) && <span>{fmtDate(a.published_at)}</span>}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--brand)',
                fontWeight: 600,
              }}>
                Read <FaArrowRight size={14} />
              </span>
            </div>
          </Link>
        ))}
      </main>
    </VassoLayout>
  );
};

export default VassoArticlesIndex;
