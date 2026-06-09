import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useReveal } from '../hooks/landingAnimations';
import { tutorSiteUrl } from '../hooks/useTenant';
import { SkeletonCard } from '../components/Skeleton';

// /discover — content-led tutor discovery feed.
//
// We pull articles + modules across every tutor and let the visitor
// filter by language chips. Each card surfaces the tutor's name, photo,
// and slug so a curious reader can jump straight to their site after
// reading the piece.

const PAGE_SIZE = 24;

const KIND_LABEL = {
  article: 'Article',
  module: 'Module',
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
};

const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={
      'px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ease-soft ' +
      (active
        ? 'bg-kotoba-primary text-white shadow-soft'
        : 'bg-white text-kotoba-text/70 border border-kotoba-text/[0.08] hover:border-kotoba-primary/40 hover:text-kotoba-primary hover:-translate-y-0.5')
    }
  >
    {children}
  </button>
);

const RevealBlock = ({ children, delay = 0, className = '' }) => {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={`v2-reveal ${visible ? 'is-revealed' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
};

const Discover = () => {
  const [items, setItems] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [language, setLanguage] = useState(null);
  const [kind, setKind] = useState('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async ({ reset = false } = {}) => {
    if (reset) {
      setLoading(true);
      setOffset(0);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await client.get('/discover', {
        params: {
          language: language || undefined,
          kind,
          offset: reset ? 0 : offset,
          limit: PAGE_SIZE,
        },
      });
      const newItems = res.data?.items || [];
      setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
      setHasMore(!!res.data?.has_more);
      if (reset) setLanguages(res.data?.languages || []);
      setOffset((prev) => (reset ? newItems.length : prev + newItems.length));
    } catch {
      // Surface failure quietly — discovery is best-effort.
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, kind]);

  return (
    <main className="font-sans bg-kotoba-background min-h-screen text-kotoba-text relative isolate">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[40vh] -z-10 overflow-hidden">
        <div
          className="v2-mesh-blob"
          style={{
            top: '-10%',
            left: '-10%',
            width: '60%',
            height: '70%',
            background:
              'radial-gradient(circle, rgba(214,164,47,0.20), transparent 70%)',
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <RevealBlock>
          <header className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              Discover
            </p>
            <h1 className="mt-3 font-display text-5xl sm:text-6xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
              Find a tutor through{' '}
              <span className="italic text-kotoba-secondary-dark">what they teach.</span>
            </h1>
            <p className="mt-5 text-lg text-kotoba-text/75 leading-relaxed max-w-2xl">
              Every article and module, written by working language tutors. Read for free
              to find someone whose voice fits — and book a lesson when you're ready.
            </p>
          </header>
        </RevealBlock>

        {/* Filter chips */}
        <RevealBlock delay={100}>
          <div className="mt-10 space-y-3" data-tour="discover-filters">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55">
                Type
              </span>
              {['all', 'article', 'module'].map((k) => (
                <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                  {k === 'all' ? 'All' : k === 'article' ? 'Articles' : 'Modules'}
                </Chip>
              ))}
            </div>

            {languages.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55">
                  Language
                </span>
                <Chip active={!language} onClick={() => setLanguage(null)}>
                  Any
                </Chip>
                {languages.map((lng) => (
                  <Chip
                    key={lng}
                    active={language === lng}
                    onClick={() => setLanguage(lng)}
                  >
                    {lng}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </RevealBlock>

        {loading ? (
          <div className="mt-10">
            <SkeletonCard />
          </div>
        ) : items.length === 0 ? (
          <div className="mt-10 bg-white rounded-3xl shadow-soft p-10 text-center">
            <p className="text-kotoba-text/70">
              No content matches yet. Try a different language or check back soon — new
              tutors publish every week.
            </p>
          </div>
        ) : (
          <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((it, i) => {
              const tutorBase = tutorSiteUrl(it.tutor_slug, '');
              const linkPath =
                it.kind === 'article'
                  ? `/articles/${it.slug}`
                  : `/modules/${it.slug}`;
              return (
                <RevealBlock key={`${it.kind}-${it.id}`} delay={Math.min(i, 8) * 40}>
                  <li className="group bg-white rounded-3xl shadow-soft hover:shadow-soft-lg hover:-translate-y-1 transition-all duration-500 ease-soft overflow-hidden flex flex-col h-full">
                    <a
                      href={`${tutorBase}${linkPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {it.image_url ? (
                        <img
                          src={it.image_url}
                          alt=""
                          className="w-full h-44 object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-44 flex items-center justify-center"
                          style={{
                            background:
                              'radial-gradient(ellipse 60% 70% at 30% 30%, rgb(var(--kotoba-secondary-rgb) / 0.35), transparent 70%),' +
                              'rgb(var(--kotoba-primary-rgb) / 0.06)',
                          }}
                        >
                          <span className="font-display text-5xl font-bold text-kotoba-primary/40">
                            {it.title?.[0] || (it.kind === 'module' ? 'M' : 'A')}
                          </span>
                        </div>
                      )}
                      <div className="p-5 space-y-3 flex-grow">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-kotoba-secondary/30 text-kotoba-text">
                            {KIND_LABEL[it.kind]}
                          </span>
                          {it.is_premium && (
                            <span className="px-2 py-0.5 rounded bg-kotoba-primary/15 text-kotoba-primary">
                              Paid module
                            </span>
                          )}
                          {it.language && (
                            <span className="px-2 py-0.5 rounded bg-kotoba-background text-kotoba-text/65">
                              {it.language}
                            </span>
                          )}
                        </div>
                        <h2 className="font-display text-xl font-bold text-kotoba-primary leading-tight tracking-[-0.01em]">
                          {it.title}
                        </h2>
                        {it.summary && (
                          <p className="text-sm text-kotoba-text/75 line-clamp-3 leading-relaxed">
                            {it.summary}
                          </p>
                        )}
                      </div>
                    </a>

                    <div className="px-5 pb-5 pt-2 border-t border-kotoba-text/[0.04] mt-auto flex items-center gap-3">
                      {it.tutor_photo_url ? (
                        <img
                          src={it.tutor_photo_url}
                          alt={it.tutor_display_name || 'Tutor'}
                          className="w-10 h-10 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-2xl bg-kotoba-secondary/30 flex items-center justify-center text-kotoba-primary font-display font-bold">
                          {(it.tutor_display_name || '?').charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-grow">
                        <p className="font-display text-sm font-bold text-kotoba-text truncate">
                          {it.tutor_display_name || 'Tutor'}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/50">
                          {formatDate(it.published_at)}
                        </p>
                      </div>
                      <a
                        href={tutorBase || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-kotoba-primary hover:gap-2 gap-1 inline-flex items-center transition-all whitespace-nowrap"
                      >
                        Their site <span aria-hidden="true">→</span>
                      </a>
                    </div>
                  </li>
                </RevealBlock>
              );
            })}
          </ul>
        )}

        {hasMore && (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={() => load()}
              disabled={loadingMore}
              className="group inline-flex items-center px-6 py-3 rounded-2xl border border-kotoba-primary/30 text-kotoba-primary font-semibold hover:border-kotoba-primary hover:bg-kotoba-primary/5 hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
              {!loadingMore && (
                <span
                  className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  →
                </span>
              )}
            </button>
          </div>
        )}

        <RevealBlock>
          <section className="relative mt-16 rounded-3xl bg-kotoba-primary text-white shadow-soft-lg overflow-hidden isolate p-10 sm:p-12 max-w-3xl mx-auto text-center">
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10"
              style={{
                background:
                  'radial-gradient(ellipse 50% 70% at 100% 0%, rgba(214,164,47,0.25), transparent 60%),' +
                  'radial-gradient(ellipse 40% 40% at 0% 100%, rgba(255,255,255,0.05), transparent 70%)',
              }}
            />
            <div className="v2-noise" />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary">
                Reading because you're picking a tutor?
              </p>
              <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold leading-tight tracking-[-0.015em]">
                Their writing voice{' '}
                <span className="italic text-kotoba-secondary">is their teaching voice.</span>
              </h2>
              <p className="mt-4 text-base text-white/80 leading-relaxed max-w-xl mx-auto">
                If their articles feel right, their lessons probably do too. Click "Their
                site" on any card to book a free trial — most tutors offer one.
              </p>
              <Link
                to="/library"
                className="group mt-7 inline-flex items-center px-7 py-3.5 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft-lg hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
              >
                Browse all tutors
                <span
                  className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  →
                </span>
              </Link>
            </div>
          </section>
        </RevealBlock>
      </div>
    </main>
  );
};

export default Discover;
