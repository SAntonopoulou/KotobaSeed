import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import client from '../api/client';
import BookingDialog from '../components/BookingDialog';
import { useAuth } from '../context/AuthContext';
import { useDwellScroll, useReveal } from '../hooks/landingAnimations';
import { apexUrl } from '../hooks/useTenant';
import { getErrorMessage } from '../utils/errors';

const formatPrice = (cents, currency = 'eur') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'eur').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
};

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

// Anti-gaming thresholds for premium read tracking. Must match the
// backend in routers/articles.py.
const READ_MIN_DWELL_SECONDS = 30;
const READ_MIN_SCROLL_PERCENT = 50;

// :::vocab[term|gloss] post-processor — turn the shortcode into a
// hoverable span. react-markdown emits strings; we walk text children.
const renderWithVocab = (text) => {
  if (typeof text !== 'string') return text;
  const re = /:::vocab\[([^|\]]+)\|([^\]]+)\]/g;
  const parts = [];
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <span
        key={`${match.index}-${match[1]}`}
        title={match[2].trim()}
        className="inline-flex items-baseline gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-kotoba-secondary/40 text-kotoba-text cursor-help border-b border-dashed border-kotoba-primary/50"
      >
        {match[1].trim()}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

const mapChildren = (children) => {
  if (Array.isArray(children)) {
    return children.flatMap((c, i) =>
      typeof c === 'string'
        ? renderWithVocab(c)
        : [<React.Fragment key={i}>{c}</React.Fragment>]
    );
  }
  if (typeof children === 'string') return renderWithVocab(children);
  return children;
};

const components = {
  p: ({ children }) => <p>{mapChildren(children)}</p>,
  li: ({ children }) => <li>{mapChildren(children)}</li>,
  td: ({ children }) => <td>{mapChildren(children)}</td>,
  a: ({ href, children }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="text-kotoba-primary underline decoration-kotoba-primary/40 underline-offset-2 hover:decoration-kotoba-primary"
    >
      {mapChildren(children)}
    </a>
  ),
};

// Pick the most prominent lesson pack for the cross-sell — prefer a
// single-lesson pack so the CTA reads like "book one lesson" rather
// than "buy a 5-pack". Falls back to whatever's there.
const pickFeaturedPack = (packs) => {
  if (!Array.isArray(packs) || packs.length === 0) return null;
  const single = packs.find(
    (p) => !p.is_group && (p.num_lessons === 1 || p.num_lessons == null)
  );
  return single || packs[0];
};

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

// --- Engagement components: rating widget + comments section ---------

const StarRow = ({ value, hoverValue, onPick, onHover, onLeave, readOnly = false, size = 'md' }) => {
  const sizeCls = size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';
  return (
    <div
      className="inline-flex items-center gap-0.5"
      onMouseLeave={onLeave}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const lit = (hoverValue || value) >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onPick?.(n)}
            onMouseEnter={() => !readOnly && onHover?.(n)}
            className={
              'transition-transform duration-200 ' +
              (readOnly
                ? 'cursor-default'
                : 'cursor-pointer hover:-translate-y-0.5')
            }
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`${sizeCls} ${lit ? 'text-kotoba-secondary-dark' : 'text-kotoba-text/20'} fill-current`}
              aria-hidden="true"
            >
              <path d="M12 2.5l2.74 6.45 7.01.55-5.32 4.55 1.62 6.85L12 17.27 5.95 20.9l1.62-6.85L2.25 9.5l7.01-.55z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
};

const RatingWidget = ({ article, token, isOwner, readDwellScroll }) => {
  const [summary, setSummary] = useState(() => ({
    avg: article.rating_avg,
    count: article.rating_count,
    your_stars: null,
    your_body: null,
  }));
  const [hoverStars, setHoverStars] = useState(0);
  const [bodyDraft, setBodyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!article || isOwner) return;
    setLoading(true);
    (async () => {
      try {
        const res = await client.get(`/articles/${article.id}/ratings`);
        setSummary(res.data || summary);
        setBodyDraft(res.data?.your_body || '');
      } catch {
        /* anonymous fetches just leave summary as-is */
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id, isOwner]);

  const submit = async (stars) => {
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
      return;
    }
    const { dwellSeconds, scrollPercent } = readDwellScroll();
    setBusy(true);
    setError('');
    try {
      const res = await client.post(`/articles/${article.id}/rate`, {
        stars,
        body: bodyDraft.trim() || null,
        dwell_seconds: dwellSeconds,
        scroll_percent: scrollPercent,
      });
      setSummary(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save rating.'));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      const res = await client.delete(`/articles/${article.id}/rate`);
      setSummary({ ...res.data, your_stars: null, your_body: null });
      setBodyDraft('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove rating.'));
    } finally {
      setBusy(false);
    }
  };

  // The tutor sees a read-only summary on their own article (we don't
  // want them gaming their own rating).
  if (isOwner) {
    return (
      <section className="mt-8 rounded-3xl bg-white shadow-soft p-6 sm:p-8">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
          Reader ratings
        </p>
        <div className="mt-3 flex items-center gap-4">
          <StarRow value={Math.round(summary.avg || 0)} readOnly size="lg" />
          <div>
            <p className="font-display text-2xl font-bold text-kotoba-primary tabular-nums">
              {summary.avg ? summary.avg.toFixed(1) : '—'}
            </p>
            <p className="text-xs text-kotoba-text/55">
              {summary.count} {summary.count === 1 ? 'rating' : 'ratings'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-3xl bg-white shadow-soft p-6 sm:p-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
            Rate this article
          </p>
          <p className="mt-1 text-sm text-kotoba-text/70">
            How useful was it? Helps fellow learners (and the discovery feed).
          </p>
        </div>
        {summary.count > 0 && (
          <div className="text-right">
            <div className="font-display text-xl font-bold text-kotoba-primary tabular-nums leading-none">
              {summary.avg ? summary.avg.toFixed(1) : '—'}
            </div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55 mt-1">
              {summary.count} {summary.count === 1 ? 'rating' : 'ratings'}
            </p>
          </div>
        )}
      </div>
      <div className="mt-5 flex items-center gap-4 flex-wrap">
        <StarRow
          value={summary.your_stars || 0}
          hoverValue={hoverStars}
          onPick={(n) => submit(n)}
          onHover={(n) => setHoverStars(n)}
          onLeave={() => setHoverStars(0)}
          size="lg"
        />
        {summary.your_stars != null && (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="text-xs text-kotoba-text/55 hover:text-kotoba-text underline-offset-2 hover:underline"
          >
            Clear my rating
          </button>
        )}
      </div>
      {summary.your_stars != null && (
        <div className="mt-4">
          <label className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
            One-line thought (optional)
          </label>
          <input
            type="text"
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            maxLength={280}
            placeholder="Helpful, eye-opening, kept me hooked…"
            className="mt-1 w-full px-3 py-2 text-sm border border-kotoba-text/15 rounded-2xl focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => submit(summary.your_stars)}
              disabled={busy}
              className="text-xs font-semibold text-kotoba-primary hover:underline disabled:opacity-50"
            >
              Save note
            </button>
          </div>
        </div>
      )}
      {loading && <p className="mt-3 text-xs text-kotoba-text/50">Loading…</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {!loading && summary.your_stars == null && !token && (
        <p className="mt-3 text-xs text-kotoba-text/55">
          Sign in to rate.
        </p>
      )}
    </section>
  );
};

const Comment = ({ c, isOwner, onReply, onDelete, onHide, onUnhide }) => (
  <div className="flex gap-3">
    {c.author_avatar_url ? (
      <img
        src={c.author_avatar_url}
        alt={c.author_name || 'Reader'}
        className="flex-shrink-0 w-10 h-10 rounded-2xl object-cover"
      />
    ) : (
      <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-kotoba-secondary/30 flex items-center justify-center font-display font-bold text-kotoba-primary">
        {(c.author_name || '?').charAt(0)}
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-display font-bold text-sm text-kotoba-primary">
          {c.author_name || 'Reader'}
        </span>
        {c.is_tutor_response && (
          <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-secondary-dark bg-kotoba-secondary/30 px-1.5 py-0.5 rounded">
            Tutor
          </span>
        )}
        {c.hidden && (
          <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/50 bg-kotoba-text/10 px-1.5 py-0.5 rounded">
            Hidden
          </span>
        )}
        <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/45">
          {formatDate(c.created_at)}
        </span>
      </div>
      <p
        className={
          'mt-1.5 text-sm whitespace-pre-line leading-relaxed ' +
          (c.hidden ? 'text-kotoba-text/45 italic' : 'text-kotoba-text/85')
        }
      >
        {c.body_markdown}
      </p>
      <div className="mt-2 flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => onReply(c)}
          className="text-kotoba-primary hover:underline font-semibold"
        >
          Reply
        </button>
        {c.is_own && (
          <button
            type="button"
            onClick={() => onDelete(c)}
            className="text-red-500 hover:text-red-700 hover:underline"
          >
            Delete
          </button>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={() => (c.hidden ? onUnhide(c) : onHide(c))}
            className="text-kotoba-text/55 hover:text-kotoba-text hover:underline"
          >
            {c.hidden ? 'Unhide' : 'Hide'}
          </button>
        )}
      </div>
    </div>
  </div>
);

const CommentsSection = ({ article, token, user, isOwner, readDwellScroll }) => {
  const [enabled, setEnabled] = useState(article.comments_enabled);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/articles/${article.id}/comments`);
      setEnabled(res.data?.enabled || false);
      setItems(res.data?.items || []);
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id]);

  if (!enabled && !isOwner) return null;

  const submit = async () => {
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
      return;
    }
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    const { dwellSeconds, scrollPercent } = readDwellScroll();
    try {
      await client.post(`/articles/${article.id}/comments`, {
        body_markdown: body.trim(),
        parent_id: replyTo?.id || null,
        dwell_seconds: dwellSeconds,
        scroll_percent: scrollPercent,
      });
      setBody('');
      setReplyTo(null);
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not post comment.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    try {
      await client.delete(`/articles/${article.id}/comments/${c.id}`);
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete.'));
    }
  };

  const hide = async (c) => {
    try {
      await client.post(`/articles/${article.id}/comments/${c.id}/hide`);
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not hide.'));
    }
  };

  const unhide = async (c) => {
    try {
      await client.post(`/articles/${article.id}/comments/${c.id}/unhide`);
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not unhide.'));
    }
  };

  const topLevel = items.filter((c) => c.parent_id == null);
  const repliesByParent = items.reduce((acc, c) => {
    if (c.parent_id != null) {
      (acc[c.parent_id] ||= []).push(c);
    }
    return acc;
  }, {});

  return (
    <section className="mt-8 rounded-3xl bg-white shadow-soft p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
            Conversation
          </p>
          <h3 className="mt-1 font-display text-2xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
            {items.length === 0
              ? 'Start the thread'
              : `${items.length} ${items.length === 1 ? 'comment' : 'comments'}`}
          </h3>
        </div>
        {isOwner && !enabled && (
          <span className="text-xs text-kotoba-text/55 italic">
            Comments are off for this article — turn them on from the editor.
          </span>
        )}
      </div>

      {enabled && (
        <div className="mt-5">
          {replyTo && (
            <div className="mb-2 inline-flex items-center gap-2 text-xs bg-kotoba-primary/10 text-kotoba-primary px-3 py-1.5 rounded-full">
              Replying to {replyTo.author_name || 'Reader'}
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="hover:underline"
                aria-label="Cancel reply"
              >
                ✕
              </button>
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder={token ? 'Add your thought…' : 'Sign in to comment.'}
            disabled={!token}
            className="w-full px-3 py-2 text-sm border border-kotoba-text/15 rounded-2xl focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all disabled:opacity-50"
          />
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/45">
              {body.length}/4000
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !body.trim()}
              className="group inline-flex items-center px-5 py-2 rounded-2xl bg-kotoba-primary text-white text-sm font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {busy ? 'Posting…' : 'Post comment'}
              <span
                className="ml-1.5 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              >
                →
              </span>
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}

      <div className="mt-7 space-y-6">
        {loading && items.length === 0 ? (
          <p className="text-sm text-kotoba-text/55">Loading…</p>
        ) : topLevel.length === 0 ? (
          enabled && (
            <p className="text-sm text-kotoba-text/55">
              No comments yet. Be the first.
            </p>
          )
        ) : (
          topLevel.map((c) => (
            <div key={c.id} className="space-y-4">
              <Comment
                c={c}
                isOwner={isOwner}
                onReply={(x) => setReplyTo(x)}
                onDelete={remove}
                onHide={hide}
                onUnhide={unhide}
              />
              {(repliesByParent[c.id] || []).map((r) => (
                <div key={r.id} className="ml-12">
                  <Comment
                    c={r}
                    isOwner={isOwner}
                    onReply={(x) => setReplyTo(x)}
                    onDelete={remove}
                    onHide={hide}
                    onUnhide={unhide}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
};

const ArticleReader = () => {
  const { slug } = useParams();
  const { user, token } = useAuth();
  const [article, setArticle] = useState(null);
  const [tutor, setTutor] = useState(null);
  const [packs, setPacks] = useState([]);
  const [trial, setTrial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buying, setBuying] = useState(false);
  const [waiveWithdrawal, setWaiveWithdrawal] = useState(false);
  // The pack the BookingDialog opens with. `null` = closed.
  const [bookingPack, setBookingPack] = useState(null);
  const dwellStartedAtRef = useRef(null);
  const readPostedRef = useRef(false);
  // Reused by the rating widget and the comment composer so both share
  // the same dwell + scroll source the read-tracking already uses.
  const readDwellScroll = useDwellScroll();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [a, t, p, tr] = await Promise.all([
          client.get(`/articles/${slug}`),
          client.get('/tutor/me'),
          client.get('/tutor/lesson-packs').catch(() => ({ data: [] })),
          client.get('/tutor/trial').catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        setArticle(a.data);
        setTutor(t.data || null);
        setPacks(p.data || []);
        setTrial(tr.data || null);
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Article not found.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Premium read tracking — only fires for Plus+ subscribers reading
  // the full (non-preview) version of a subscriber-only article.
  useEffect(() => {
    if (!article || !user || !token) return;
    if (article.is_preview) return;
    if (article.visibility !== 'subscribers_only') return;
    if (readPostedRef.current) return;
    dwellStartedAtRef.current = Date.now();

    const scrollPercent = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return 100;
      return Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100)));
    };

    const tryRegister = async () => {
      if (readPostedRef.current) return;
      const dwell = Math.floor(
        (Date.now() - (dwellStartedAtRef.current || Date.now())) / 1000
      );
      const scroll = scrollPercent();
      if (dwell < READ_MIN_DWELL_SECONDS || scroll < READ_MIN_SCROLL_PERCENT) return;
      readPostedRef.current = true;
      try {
        await client.post(`/articles/${article.id}/read`, {
          dwell_seconds: dwell,
          scroll_percent: scroll,
        });
      } catch {
        readPostedRef.current = false;
      }
    };

    const onScroll = () => tryRegister();
    const intervalId = window.setInterval(tryRegister, 5000);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('scroll', onScroll);
    };
  }, [article, user, token]);

  const buyArticle = async () => {
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
      return;
    }
    if (!waiveWithdrawal) {
      setError('Please tick the consent box above to continue to checkout.');
      return;
    }
    setBuying(true);
    try {
      const res = await client.post(`/articles/${article.id}/checkout`, {
        waive_withdrawal: true,
      });
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setError('Could not start checkout.');
    } catch (err) {
      setError(getErrorMessage(err, 'Checkout failed.'));
    } finally {
      setBuying(false);
    }
  };

  const featuredPack = pickFeaturedPack(packs);
  const initial = (tutor?.display_name || tutor?.tutor_slug || '?')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
      {/* Sticky header with backdrop blur — keeps the brand + back-link
          present without dominating the read. */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-kotoba-text/[0.06]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
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
            to="/articles"
            className="text-sm text-kotoba-text/70 hover:text-kotoba-primary inline-flex items-center gap-1.5"
          >
            <span aria-hidden="true">←</span> All articles
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {loading && !error && (
          <p className="text-kotoba-text/60 text-center py-12">Loading…</p>
        )}

        {article && (
          <>
            <RevealBlock>
              <article className="bg-white rounded-3xl shadow-soft p-7 sm:p-10 lg:p-12 prose prose-lg max-w-none prose-headings:font-display prose-headings:text-kotoba-primary prose-headings:tracking-tight prose-a:no-underline">
                {/* Article header */}
                <header className="mb-8 not-prose">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/50">
                    {article.published_at && <span>{formatDate(article.published_at)}</span>}
                    {article.published_at && <span aria-hidden="true">·</span>}
                    <span>{tutor?.display_name || 'Tutor'}</span>
                    {article.is_preview && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5 text-kotoba-primary">
                          <span className="w-1.5 h-1.5 rounded-full bg-kotoba-primary v2-pulse-dot" />
                          Preview
                        </span>
                      </>
                    )}
                  </div>
                  <h1 className="mt-3 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
                    {article.title}
                  </h1>
                  {article.summary && (
                    <p className="mt-4 text-lg text-kotoba-text/75 leading-relaxed">
                      {article.summary}
                    </p>
                  )}
                </header>

                {/* Body */}
                <div className={article.is_preview ? 'relative' : ''}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                    {article.body_markdown}
                  </ReactMarkdown>
                  {article.is_preview && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white"
                    />
                  )}
                </div>

                {/* Preview gate CTA */}
                {article.is_preview && (
                  <div className="not-prose mt-8 rounded-3xl border border-kotoba-primary/15 bg-gradient-to-br from-kotoba-primary/[0.04] to-kotoba-secondary/10 p-6 sm:p-8 space-y-5">
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                        Keep reading
                      </p>
                      <h3 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight">
                        Two ways in.
                      </h3>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <a
                        href={apexUrl('/pricing?plan=plus')}
                        className="group flex flex-col items-start p-5 rounded-2xl bg-white border border-kotoba-primary/20 hover:border-kotoba-primary hover:shadow-soft transition-all duration-300 ease-soft"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-kotoba-primary bg-kotoba-primary/10 px-2 py-0.5 rounded">
                          Best value
                        </span>
                        <span className="mt-3 font-display font-bold text-lg text-kotoba-primary leading-tight">
                          Upgrade to Plus
                        </span>
                        <span className="mt-1.5 text-sm text-kotoba-text/70 leading-snug">
                          Unlock every premium article from every tutor on Kotobaseed.
                        </span>
                        <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-kotoba-primary group-hover:gap-2.5 transition-all">
                          See Plus pricing <span aria-hidden="true">→</span>
                        </span>
                      </a>

                      {article.price_cents > 0 ? (
                        <button
                          type="button"
                          onClick={buyArticle}
                          disabled={buying || (token && !waiveWithdrawal)}
                          className="group flex flex-col items-start p-5 rounded-2xl bg-white border border-kotoba-text/10 hover:border-kotoba-secondary-dark hover:shadow-soft transition-all duration-300 ease-soft text-left disabled:opacity-50"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-kotoba-text/60 bg-kotoba-text/5 px-2 py-0.5 rounded">
                            Just this one
                          </span>
                          <span className="mt-3 font-display font-bold text-lg text-kotoba-text leading-tight">
                            Buy this article — {formatPrice(article.price_cents, article.currency)}
                          </span>
                          <span className="mt-1.5 text-sm text-kotoba-text/70 leading-snug">
                            {buying
                              ? 'Loading checkout…'
                              : `${tutor?.display_name || 'The tutor'} keeps 90% of every sale.`}
                          </span>
                          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-kotoba-text/80 group-hover:gap-2.5 transition-all">
                            Continue to Stripe <span aria-hidden="true">→</span>
                          </span>
                        </button>
                      ) : (
                        <div className="flex flex-col items-start p-5 rounded-2xl bg-white/70 border border-kotoba-text/[0.06] text-left">
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-kotoba-text/40 bg-kotoba-text/5 px-2 py-0.5 rounded">
                            Plus only
                          </span>
                          <span className="mt-3 font-display font-bold text-lg text-kotoba-text/60 leading-tight">
                            Not for sale individually
                          </span>
                          <span className="mt-1.5 text-sm text-kotoba-text/50 leading-snug">
                            This article is exclusive to Plus subscribers.
                          </span>
                        </div>
                      )}
                    </div>
                    {article.price_cents > 0 && token && (
                      <label className="flex items-start gap-2 text-xs text-kotoba-text/70 pt-2">
                        <input
                          type="checkbox"
                          checked={waiveWithdrawal}
                          onChange={(e) => setWaiveWithdrawal(e.target.checked)}
                          className="mt-0.5 h-4 w-4 text-kotoba-primary rounded focus:ring-kotoba-primary border-kotoba-text/20"
                        />
                        <span>
                          Required before piecemeal purchase: I want access right after payment, so I waive my 14-day right of withdrawal under the EU Consumer Rights Directive (Article 16(m)). I understand I lose my refund right once I open the article.
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </article>
            </RevealBlock>

            {/* Cross-sell: book a lesson with the tutor whose voice you
                just read. Shown unless the viewer is the tutor themselves
                or the tutor has no bookable surface configured. */}
            {tutor && tutor.user_id !== user?.id && (trial || featuredPack) && (
              <RevealBlock delay={120}>
                <section className="mt-8 rounded-3xl bg-kotoba-primary text-white shadow-soft-lg overflow-hidden relative isolate">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 -z-10"
                    style={{
                      background:
                        'radial-gradient(ellipse 60% 70% at 100% 0%, rgba(214,164,47,0.30), transparent 60%),' +
                        'radial-gradient(ellipse 40% 40% at 0% 100%, rgba(255,255,255,0.06), transparent 70%)',
                    }}
                  />
                  <div className="v2-noise" />
                  <div className="relative p-7 sm:p-10">
                    <div className="flex items-start gap-4 sm:gap-6">
                      <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-kotoba-secondary/30 backdrop-blur-sm flex items-center justify-center font-display text-2xl sm:text-3xl font-bold text-kotoba-secondary">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary">
                          Liked this piece?
                        </p>
                        <h3 className="mt-2 font-display text-2xl sm:text-3xl font-bold leading-tight">
                          Take a lesson with{' '}
                          <span className="italic">{tutor.display_name || 'this tutor'}.</span>
                        </h3>
                        <p className="mt-3 text-sm sm:text-base text-white/80 leading-relaxed max-w-xl">
                          The voice you've been reading is also the voice you'll learn from. Most
                          new students start with a free 15-minute chat.
                        </p>
                      </div>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      {trial && (
                        <button
                          type="button"
                          onClick={() =>
                            setBookingPack({
                              isTrial: true,
                              duration_minutes: trial.duration_minutes || 15,
                            })
                          }
                          className="group inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
                        >
                          Book free 15-min trial
                          <span
                            className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                            aria-hidden="true"
                          >
                            →
                          </span>
                        </button>
                      )}
                      {featuredPack && (
                        <button
                          type="button"
                          onClick={() => setBookingPack(featuredPack)}
                          className="inline-flex items-center justify-center px-6 py-3 rounded-2xl border border-white/25 text-white font-semibold hover:bg-white/10 transition-colors duration-300"
                        >
                          Book a lesson
                          <span className="ml-2 text-white/70 text-sm">
                            {formatPrice(featuredPack.price_cents, featuredPack.currency)}
                            {featuredPack.duration_minutes
                              ? ` · ${featuredPack.duration_minutes} min`
                              : ''}
                          </span>
                        </button>
                      )}
                      <Link
                        to="/"
                        className="inline-flex items-center px-3 text-sm text-white/70 hover:text-white"
                      >
                        See all options →
                      </Link>
                    </div>
                  </div>
                </section>
              </RevealBlock>
            )}

            {/* Engagement layer — rating widget + (opt-in) comments
                section. Hidden for previews because the reader hasn't
                actually consumed the article yet. */}
            {!article.is_preview && (
              <RevealBlock delay={160}>
                <RatingWidget
                  article={article}
                  token={token}
                  isOwner={user && tutor && user.id === tutor.user_id}
                  readDwellScroll={readDwellScroll}
                />
              </RevealBlock>
            )}

            {!article.is_preview && (
              <RevealBlock delay={200}>
                <CommentsSection
                  article={article}
                  token={token}
                  user={user}
                  isOwner={user && tutor && user.id === tutor.user_id}
                  readDwellScroll={readDwellScroll}
                />
              </RevealBlock>
            )}
          </>
        )}
      </main>

      {bookingPack && (
        <BookingDialog
          pack={bookingPack}
          tutorDisplayName={tutor?.display_name || 'this tutor'}
          onClose={() => setBookingPack(null)}
        />
      )}
    </div>
  );
};

export default ArticleReader;
