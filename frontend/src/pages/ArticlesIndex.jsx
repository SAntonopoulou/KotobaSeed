import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useReveal } from '../hooks/landingAnimations';
import { apexUrl } from '../hooks/useTenant';
import { getErrorMessage } from '../utils/errors';

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

const RevealBlock = ({ children, delay = 0 }) => {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={`v2-reveal ${visible ? 'is-revealed' : ''}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
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
        setError(getErrorMessage(err, 'Could not load articles.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-kotoba-text/[0.06]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href={apexUrl('/')}
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-kotoba-text/50 hover:text-kotoba-primary transition-colors"
            >
              Kotobaseed
            </a>
            <span className="text-kotoba-text/20">/</span>
            <Link
              to="/"
              className="font-display text-lg font-bold text-kotoba-primary hover:underline truncate"
            >
              {tutor?.display_name || 'Tutor'}
            </Link>
          </div>
          <Link
            to="/"
            className="text-sm text-kotoba-text/70 hover:text-kotoba-primary inline-flex items-center gap-1.5"
          >
            <span aria-hidden="true">←</span> Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <RevealBlock>
          <header className="mb-10 sm:mb-12">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              The library
            </p>
            <h1 className="mt-2 font-display text-5xl sm:text-6xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
              Articles
            </h1>
            {tutor?.display_name && (
              <p className="mt-4 text-lg text-kotoba-text/70 leading-relaxed">
                Free reads from{' '}
                <span className="font-display italic text-kotoba-primary">
                  {tutor.display_name}
                </span>
                . Subscribers get more.
              </p>
            )}
          </header>
        </RevealBlock>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-kotoba-text/60">Loading…</p>
        ) : articles.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-soft p-10 text-center">
            <p className="text-kotoba-text/70">
              No articles published yet. Check back soon.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {articles.map((a, i) => (
              <RevealBlock key={a.id} delay={i * 50}>
                <li>
                  <Link
                    to={`/articles/${a.slug}`}
                    className="group block bg-white rounded-3xl shadow-soft hover:shadow-soft-lg hover:-translate-y-1 transition-all duration-500 ease-soft p-6 sm:p-7 no-underline"
                  >
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/50">
                      {formatDate(a.published_at)}
                    </p>
                    <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em] group-hover:translate-x-0 transition-colors">
                      {a.title}
                    </h2>
                    {a.summary && (
                      <p className="mt-3 text-base text-kotoba-text/80 leading-relaxed">
                        {a.summary}
                      </p>
                    )}
                    <p className="mt-4 inline-flex items-center text-sm font-semibold text-kotoba-primary gap-2 group-hover:gap-3 transition-all">
                      Read article <span aria-hidden="true">→</span>
                    </p>
                  </Link>
                </li>
              </RevealBlock>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default ArticlesIndex;
