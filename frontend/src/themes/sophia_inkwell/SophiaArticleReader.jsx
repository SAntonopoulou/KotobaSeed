import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FaArrowLeft,
  FaArrowRight,
  FaStar,
  FaRegStar,
  FaTrash,
  FaEyeSlash,
  FaEye,
} from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDwellScroll } from '../../hooks/landingAnimations';
import SophiaLayout from './SophiaLayout';
import BookingDialog from './SophiaBookingDialog';
import './sophia_inkwell.css';

// SophiaArticleReader — themed `/articles/:slug` page for Sophia's tenant.
//
// Backend integration is a 1:1 port of DafniArticleReader:
//   - GET  /articles/:slug                  → article body + metadata
//   - GET  /articles/:id/ratings            → ratings summary + viewer's stars
//   - POST /articles/:id/rate               → submit/update rating
//   - DEL  /articles/:id/rate               → remove viewer's rating
//   - GET  /articles/:id/comments           → thread (top-level + replies)
//   - POST /articles/:id/comments           → reply
//   - DEL  /articles/:id/comments/:cid      → delete own comment
//   - POST /articles/:id/comments/:cid/hide → tutor soft-hide
//   - POST /articles/:id/read               → premium read register
//
// Only the visual layer differs: Inkwell pack (navy + bone + coral,
// Playfair + Inter), editorial reader layout with a drop cap on the
// opening paragraph, bone hairline dividers, italic coral byline.

const READ_MIN_DWELL_SECONDS = 30;
const READ_MIN_SCROLL_PERCENT = 50;

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

// --- Rating widget ------------------------------------------------------

const StarRow = ({ value = 0, onPick, onHover, readOnly = false, size = 22 }) => {
  return (
    <div className="s-star-row">
      {[1, 2, 3, 4, 5].map((n) => {
        const lit = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onPick?.(n)}
            onMouseEnter={() => !readOnly && onHover?.(n)}
            className={lit ? 'on' : ''}
            style={readOnly ? { cursor: 'default' } : undefined}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            {lit ? <FaStar size={size} /> : <FaRegStar size={size} />}
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

  useEffect(() => {
    if (!article || isOwner) return;
    (async () => {
      try {
        const res = await client.get(`/articles/${article.id}/ratings`);
        if (res.data) {
          setSummary(res.data);
          setBodyDraft(res.data?.your_body || '');
        }
      } catch { /* anon viewers leave summary as-is */ }
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
      setError(err?.response?.data?.detail || 'Could not save rating.');
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
      setError(err?.response?.data?.detail || 'Could not remove rating.');
    } finally {
      setBusy(false);
    }
  };

  // Tutor sees a read-only summary on their own article.
  if (isOwner) {
    return (
      <section className="s-article-block">
        <p className="s-section-eyebrow">Reader ratings</p>
        <div className="s-rating-summary">
          <StarRow value={Math.round(summary.avg || 0)} readOnly size={20} />
          <div>
            <p className="s-rating-avg">
              {summary.avg ? summary.avg.toFixed(1) : '—'}
            </p>
            <p className="s-rating-count">
              {summary.count} {summary.count === 1 ? 'rating' : 'ratings'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const displayStars = hoverStars || summary.your_stars || 0;

  return (
    <section className="s-article-block">
      <div className="s-rating-head">
        <div>
          <p className="s-section-eyebrow">Rate this article</p>
          <p className="s-section-sub">
            How useful was it? Helps fellow learners (and the discovery feed).
          </p>
        </div>
        {summary.count > 0 && (
          <p className="s-rating-meta">
            {summary.avg.toFixed(1)} · {summary.count}{' '}
            {summary.count === 1 ? 'rating' : 'ratings'}
          </p>
        )}
      </div>

      <div onMouseLeave={() => setHoverStars(0)}>
        <StarRow
          value={displayStars}
          onPick={(n) => submit(n)}
          onHover={(n) => setHoverStars(n)}
          size={26}
        />
      </div>

      {summary.your_stars && (
        <div style={{ marginTop: 16 }}>
          <label className="s-field-label" htmlFor="srate-body">
            Add a short note{' '}
            <span style={{ color: 'var(--fg-subtle)', fontWeight: 500 }}>
              (optional)
            </span>
          </label>
          <textarea
            id="srate-body"
            className="s-textarea"
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            placeholder="One sentence is plenty."
            maxLength={280}
            style={{ minHeight: 76 }}
          />
          <div className="s-actions">
            <button
              type="button"
              onClick={() => submit(summary.your_stars)}
              disabled={busy}
              className="s-btn s-btn-primary s-btn-sm"
            >
              {busy ? 'Saving…' : 'Save note'}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="s-btn s-btn-ghost s-btn-sm"
            >
              Remove rating
            </button>
          </div>
        </div>
      )}

      {error && <p className="s-form-error" style={{ marginTop: 12 }}>{error}</p>}
    </section>
  );
};

// --- Comments thread ---------------------------------------------------

const Comment = ({ c, currentUser, isOwner, onReply, onDelete, onHide, onUnhide }) => {
  const isMine = currentUser && c.author_user_id === currentUser.id;
  const isHidden = c.hidden_at != null;
  const created = fmtDate(c.created_at);

  return (
    <div className={`s-comment${isHidden ? ' is-hidden' : ''}`}>
      <div className="s-comment-head">
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span className="s-comment-author">
            {c.author_display_name || 'A reader'}
          </span>
          {isHidden && <span className="s-tag-hidden">Hidden</span>}
        </div>
        <span className="s-comment-date">{created}</span>
      </div>
      <div className="s-comment-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body_markdown}</ReactMarkdown>
      </div>
      <div className="s-comment-actions">
        {!isHidden && (
          <button
            type="button"
            onClick={() => onReply?.(c)}
            className="s-link-btn"
          >
            Reply
          </button>
        )}
        {isMine && (
          <button
            type="button"
            onClick={() => onDelete?.(c)}
            className="s-link-btn is-danger"
          >
            <FaTrash size={11} /> Delete
          </button>
        )}
        {isOwner && !isMine && !isHidden && (
          <button
            type="button"
            onClick={() => onHide?.(c)}
            className="s-link-btn is-muted"
          >
            <FaEyeSlash size={12} /> Hide
          </button>
        )}
        {isOwner && !isMine && isHidden && (
          <button
            type="button"
            onClick={() => onUnhide?.(c)}
            className="s-link-btn is-muted"
          >
            <FaEye size={12} /> Restore
          </button>
        )}
      </div>
    </div>
  );
};

const CommentsSection = ({ article, token, currentUser, isOwner, readDwellScroll }) => {
  const [enabled, setEnabled] = useState(article.comments_enabled);
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = async () => {
    try {
      const res = await client.get(`/articles/${article.id}/comments`);
      setEnabled(res.data?.enabled || false);
      setItems(res.data?.items || []);
    } catch { /* swallow */ }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [article.id]);

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
      setError(err?.response?.data?.detail || 'Could not post comment.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    try {
      await client.delete(`/articles/${article.id}/comments/${c.id}`);
      await reload();
    } catch (err) { setError(err?.response?.data?.detail || 'Could not delete.'); }
  };

  const hide = async (c) => {
    try {
      await client.post(`/articles/${article.id}/comments/${c.id}/hide`);
      await reload();
    } catch (err) { setError(err?.response?.data?.detail || 'Could not hide.'); }
  };

  const unhide = async (c) => {
    try {
      await client.post(`/articles/${article.id}/comments/${c.id}/unhide`);
      await reload();
    } catch (err) { setError(err?.response?.data?.detail || 'Could not unhide.'); }
  };

  const topLevel = items.filter((c) => c.parent_id == null);
  const repliesByParent = items.reduce((acc, c) => {
    if (c.parent_id != null) {
      (acc[c.parent_id] ||= []).push(c);
    }
    return acc;
  }, {});

  return (
    <section className="s-article-block">
      <div style={{ marginBottom: 18 }}>
        <p className="s-section-eyebrow">Conversation</p>
        <h3 className="s-section-heading">
          {items.length === 0
            ? 'Start the thread'
            : `${items.length} ${items.length === 1 ? 'comment' : 'comments'}`}
        </h3>
      </div>

      <div className="s-field">
        {replyTo && (
          <p className="s-reply-banner">
            Replying to <b>{replyTo.author_display_name || 'a reader'}</b> ·{' '}
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="s-link-btn"
              style={{ textDecoration: 'underline' }}
            >
              cancel
            </button>
          </p>
        )}
        <textarea
          className="s-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={replyTo ? 'Write your reply…' : 'Share a thought, ask a question…'}
          maxLength={4000}
          style={{ minHeight: 84 }}
        />
        {error && <p className="s-form-error" style={{ marginTop: 8 }}>{error}</p>}
        <div className="s-actions-end">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !body.trim()}
            className="s-btn s-btn-primary s-btn-sm"
          >
            {busy ? 'Posting…' : token ? 'Post' : 'Sign in to post'}
          </button>
        </div>
      </div>

      <ol className="s-comments-list">
        {topLevel.map((c) => (
          <li key={c.id}>
            <Comment
              c={c}
              currentUser={currentUser}
              isOwner={isOwner}
              onReply={(target) => setReplyTo(target)}
              onDelete={remove}
              onHide={hide}
              onUnhide={unhide}
            />
            {(repliesByParent[c.id] || []).length > 0 && (
              <ol className="s-replies">
                {repliesByParent[c.id].map((r) => (
                  <li key={r.id}>
                    <Comment
                      c={r}
                      currentUser={currentUser}
                      isOwner={isOwner}
                      onReply={() => setReplyTo(c)}
                      onDelete={remove}
                      onHide={hide}
                      onUnhide={unhide}
                    />
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};

// --- Premium read tracking hook ----------------------------------------

const usePremiumReadGate = (article, currentUser, token) => {
  const dwellStartedAtRef = useRef(Date.now());
  const readPostedRef = useRef(false);

  useEffect(() => { dwellStartedAtRef.current = Date.now(); }, []);

  useEffect(() => {
    if (!article || !currentUser || !token) return undefined;
    // Only track reads for premium articles (the backend just ignores
    // the call for non-premium, so this is a soft optimisation).
    if (article.price_cents == null || article.price_cents <= 0) return undefined;

    const scrollPercent = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return 100;
      return Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100)));
    };

    const tryRegister = async () => {
      if (readPostedRef.current) return;
      const dwell = Math.floor((Date.now() - dwellStartedAtRef.current) / 1000);
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
  }, [article, currentUser, token]);
};

// --- Page --------------------------------------------------------------

// Pick the booking pack the article-foot CTA opens. Same heuristic as
// the default kotobaseed ArticleReader: prefer a single-lesson pack so
// the CTA reads "Book a lesson", fall back to whatever's there.
const pickFeaturedPack = (packs) => {
  const active = (packs || []).filter((p) => p?.is_active !== false);
  if (active.length === 0) return null;
  const single = active.find(
    (p) => !p.is_group && (p.num_lessons === 1 || p.num_lessons == null),
  );
  return single || active[0];
};

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£' };
const formatPrice = (cents, currency) => {
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  const sym = CURRENCY_SYMBOL[String(currency || 'EUR').toUpperCase()] || `${currency || ''} `;
  return `${sym}${text}`;
};

const SophiaArticleReader = ({ tutor }) => {
  const { slug } = useParams();
  const { currentUser, logout, token } = useAuth();
  const [article, setArticle] = useState(null);
  const [error, setError] = useState(null);
  const [packs, setPacks] = useState([]);
  const [trial, setTrial] = useState(null);
  const [bookingPack, setBookingPack] = useState(null);
  const readDwellScroll = useDwellScroll();

  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

  const featuredPack = useMemo(() => pickFeaturedPack(packs), [packs]);
  const offersTrial = trial?.offers_free_trial;

  // Load packs + trial once per article load — same shape as the
  // tenant landing's pricing data, but only the bits the CTA needs.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      client.get('/tutor/lesson-packs').catch(() => ({ data: [] })),
      client.get('/tutor/trial').catch(() => ({ data: null })),
    ]).then(([packsRes, trialRes]) => {
      if (cancelled) return;
      setPacks(packsRes.data || []);
      setTrial(trialRes.data || null);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    client
      .get(`/articles/${slug}`)
      .then((res) => { if (!cancelled) setArticle(res.data); })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 404) setError('Article not found');
        else setError(err?.message || 'Could not load this article');
      });
    return () => { cancelled = true; };
  }, [slug]);

  usePremiumReadGate(article, currentUser, token);

  if (error) {
    return (
      <SophiaLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Article not found — English with ${firstName}`}
      >
        <main className="s-content s-article-error">
          <p className="s-article-error-mark">S</p>
          <h1>{error}</h1>
          <Link to="/articles" className="s-btn s-btn-outline">Back to journal</Link>
        </main>
      </SophiaLayout>
    );
  }

  if (!article) {
    return (
      <SophiaLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Loading — English with ${firstName}`}
      >
        <main className="s-content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>
        </main>
      </SophiaLayout>
    );
  }

  const isOwner = currentUser && tutor && currentUser.id === tutor.user_id;
  const body = article.body_markdown || article.preview_markdown || '';

  return (
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`${article.title} — English with ${firstName}`}
    >
      <main className="s-content" style={{ paddingTop: 40 }}>
        <Link to="/articles" className="s-back-link">
          <FaArrowLeft size={14} /> Journal
        </Link>

        {article.published_at && (
          <p className="s-article-date">{fmtDate(article.published_at)}</p>
        )}

        <h1 className="s-article-title">{article.title}</h1>

        {article.summary && (
          <p className="s-article-byline">{article.summary}</p>
        )}

        <hr className="s-rule" />

        <article className="s-article-body">
          <div className="s-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        </article>

        <hr className="s-rule" />

        <RatingWidget
          article={article}
          token={token}
          isOwner={isOwner}
          readDwellScroll={readDwellScroll}
        />

        {/* Lesson-booking conversion card. Only renders when the tutor
            has a way to take a booking (trial offered OR a featured
            pack). Disappears cleanly otherwise. */}
        {!isOwner && (offersTrial || featuredPack) && (
          <section className="s-article-cta">
            <div className="s-article-cta-inner">
              <div>
                <p className="s-article-cta-eyebrow">Liked this piece?</p>
                <h3>
                  Take a lesson with{' '}
                  <em>{firstName}.</em>
                </h3>
                <p className="s-article-cta-body">
                  The voice you've been reading is also the voice you'll learn from.
                  {offersTrial && ' Most new students start with a free trial chat.'}
                </p>
              </div>
              <div className="s-article-cta-actions">
                {offersTrial && (
                  <button
                    type="button"
                    onClick={() =>
                      setBookingPack({
                        id: 'trial',
                        name: 'Free trial lesson',
                        isTrial: true,
                        num_lessons: 1,
                        duration_minutes: trial?.free_trial_minutes || 20,
                        price_cents: 0,
                        currency: 'eur',
                        is_group: false,
                      })
                    }
                    className="s-btn s-btn-lg s-btn-cta-primary"
                  >
                    Book a free trial <FaArrowRight size={13} />
                  </button>
                )}
                {featuredPack && (
                  <button
                    type="button"
                    onClick={() =>
                      setBookingPack({
                        ...featuredPack,
                        isTrial: false,
                      })
                    }
                    className="s-btn s-btn-lg s-btn-cta-secondary"
                  >
                    Book a lesson
                    <span className="s-cta-meta">
                      {formatPrice(featuredPack.price_cents, featuredPack.currency)}
                      {featuredPack.duration_minutes
                        ? ` · ${featuredPack.duration_minutes} min`
                        : ''}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        <CommentsSection
          article={article}
          token={token}
          currentUser={currentUser}
          isOwner={isOwner}
          readDwellScroll={readDwellScroll}
        />

        {bookingPack && (
          <BookingDialog
            pack={bookingPack}
            tutorDisplayName={tutor?.display_name || firstName}
            onClose={() => setBookingPack(null)}
          />
        )}
      </main>
    </SophiaLayout>
  );
};

export default SophiaArticleReader;
