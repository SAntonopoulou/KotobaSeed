import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FaArrowLeft, FaArrowRight, FaStar, FaRegStar, FaTrash, FaEyeSlash, FaEye } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDwellScroll } from '../../hooks/landingAnimations';
import VassoLayout from './VassoLayout';
import VassoBookingDialog from './VassoBookingDialog';
import './vasso_greek.css';

// VassoArticleReader — themed `/articles/:slug` page.
//
// Same backend integration as the default ArticleReader:
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
// The article body, ratings, and comments cards are all wrapped in
// `.theme-vasso-greek-site` via VassoLayout — same scoped tokens as
// the rest of Vasso's tenant.

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
    <div className="star-picker">
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
      <section className="panel panel-pad" style={{ marginTop: 28 }}>
        <p className="eyebrow-inline" style={{ marginBottom: 10 }}>Reader ratings</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <StarRow value={Math.round(summary.avg || 0)} readOnly size={20} />
          <div>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 28,
              margin: 0,
              color: 'var(--brand)',
              lineHeight: 1,
            }}>
              {summary.avg ? summary.avg.toFixed(1) : '—'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--fg-subtle)', margin: '4px 0 0' }}>
              {summary.count} {summary.count === 1 ? 'rating' : 'ratings'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const displayStars = hoverStars || summary.your_stars || 0;

  return (
    <section className="panel panel-pad" style={{ marginTop: 28 }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 14,
      }}>
        <div>
          <p className="eyebrow-inline" style={{ marginBottom: 4 }}>Rate this article</p>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0 }}>
            How useful was it? Helps fellow learners (and the discovery feed).
          </p>
        </div>
        {summary.count > 0 && (
          <p style={{ fontSize: 12, color: 'var(--fg-subtle)', margin: 0 }}>
            {summary.avg.toFixed(1)} · {summary.count} {summary.count === 1 ? 'rating' : 'ratings'}
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
          <label className="field-label" htmlFor="vrate-body">
            Add a short note <span style={{ color: 'var(--fg-subtle)', fontWeight: 500 }}>(optional)</span>
          </label>
          <textarea
            id="vrate-body"
            className="v-textarea"
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            placeholder="One sentence is plenty."
            maxLength={280}
            style={{ minHeight: 76 }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => submit(summary.your_stars)}
              disabled={busy}
              className="v-btn v-btn-primary v-btn-sm"
            >
              {busy ? 'Saving…' : 'Save note'}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="v-btn v-btn-ghost v-btn-sm"
            >
              Remove rating
            </button>
          </div>
        </div>
      )}

      {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}
    </section>
  );
};

// --- Comments thread ---------------------------------------------------

const Comment = ({ c, currentUser, isOwner, onReply, onDelete, onHide, onUnhide }) => {
  const isMine = currentUser && c.author_user_id === currentUser.id;
  const isHidden = c.hidden_at != null;
  const created = fmtDate(c.created_at);

  return (
    <li style={{
      listStyle: 'none',
      padding: 16,
      borderRadius: 16,
      background: isHidden ? 'var(--surface-sunk)' : 'var(--bg-tint)',
      border: '1px solid var(--border-cool)',
      opacity: isHidden && !isOwner && !isMine ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--fg)', fontSize: 15 }}>
            {c.author_display_name || 'A reader'}
          </span>
          {isHidden && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--terra-700)',
              background: 'var(--terra-100)',
              padding: '2px 7px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}>Hidden</span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>{created}</span>
      </div>
      <div className="prose" style={{ fontSize: 15, lineHeight: 1.6 }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body_markdown}</ReactMarkdown>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {!isHidden && (
          <button
            type="button"
            onClick={() => onReply?.(c)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--brand)',
            }}
          >
            Reply
          </button>
        )}
        {isMine && (
          <button
            type="button"
            onClick={() => onDelete?.(c)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--terra-700)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <FaTrash size={12} /> Delete
          </button>
        )}
        {isOwner && !isMine && !isHidden && (
          <button
            type="button"
            onClick={() => onHide?.(c)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--fg-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <FaEyeSlash size={12} /> Hide
          </button>
        )}
        {isOwner && !isMine && isHidden && (
          <button
            type="button"
            onClick={() => onUnhide?.(c)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--fg-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <FaEye size={12} /> Restore
          </button>
        )}
      </div>
    </li>
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
    <section className="panel panel-pad" style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        <div>
          <p className="eyebrow-inline" style={{ marginBottom: 4 }}>Conversation</p>
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 22,
            margin: 0,
            color: 'var(--fg)',
            letterSpacing: '-0.015em',
          }}>
            {items.length === 0
              ? 'Start the thread'
              : `${items.length} ${items.length === 1 ? 'comment' : 'comments'}`}
          </h3>
        </div>
      </div>

      <div className="field">
        {replyTo && (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 6px' }}>
            Replying to <b>{replyTo.author_display_name || 'a reader'}</b> ·{' '}
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--brand)',
                font: 'inherit',
                textDecoration: 'underline',
              }}
            >
              cancel
            </button>
          </p>
        )}
        <textarea
          className="v-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={replyTo ? 'Write your reply…' : 'Share a thought, ask a question…'}
          maxLength={4000}
          style={{ minHeight: 84 }}
        />
        {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !body.trim()}
            className="v-btn v-btn-primary v-btn-sm"
          >
            {busy ? 'Posting…' : token ? 'Post' : 'Sign in to post'}
          </button>
        </div>
      </div>

      <ol style={{
        listStyle: 'none',
        padding: 0,
        margin: '14px 0 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {topLevel.map((c) => (
          <li key={c.id} style={{ listStyle: 'none' }}>
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
              <ol style={{
                listStyle: 'none',
                padding: 0,
                margin: '10px 0 0 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                borderLeft: '2px solid var(--border-cool)',
                paddingLeft: 14,
              }}>
                {repliesByParent[c.id].map((r) => (
                  <Comment
                    key={r.id}
                    c={r}
                    currentUser={currentUser}
                    isOwner={isOwner}
                    onReply={() => setReplyTo(c)}
                    onDelete={remove}
                    onHide={hide}
                    onUnhide={unhide}
                  />
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

const VassoArticleReader = ({ tutor }) => {
  const { slug } = useParams();
  const { currentUser, logout, token } = useAuth();
  const [article, setArticle] = useState(null);
  const [error, setError] = useState(null);
  const [packs, setPacks] = useState([]);
  const [trial, setTrial] = useState(null);
  const [bookingPack, setBookingPack] = useState(null);
  const readDwellScroll = useDwellScroll();

  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Vasso';

  // Featured pack for the "Book a lesson" CTA at the foot of the
  // article. Same picker the default reader uses, just themed.
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
      <VassoLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle="Article not found — Learn Greek with Vasso"
      >
        <main className="content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{
            fontFamily: 'var(--font-logo)',
            fontWeight: 700,
            fontSize: 72,
            color: 'var(--honey-600)',
            margin: 0,
            lineHeight: 1,
          }}>α</p>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 24,
            margin: '14px 0 18px',
            color: 'var(--fg)',
          }}>{error}</h1>
          <Link to="/articles" className="v-btn v-btn-secondary v-btn-sm">Back to journal</Link>
        </main>
      </VassoLayout>
    );
  }

  if (!article) {
    return (
      <VassoLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle="Loading — Learn Greek with Vasso"
      >
        <main className="content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>
        </main>
      </VassoLayout>
    );
  }

  const isOwner = currentUser && tutor && currentUser.id === tutor.user_id;
  const body = article.body_markdown || article.preview_markdown || '';

  return (
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`${article.title} — Learn Greek with Vasso`}
    >
      <main className="content" style={{ paddingTop: 40 }}>
        <Link to="/articles" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--fg-subtle)',
          fontSize: 14,
          textDecoration: 'none',
          marginBottom: 18,
        }}>
          <FaArrowLeft size={16} /> Journal
        </Link>

        {article.published_at && (
          <p style={{
            fontSize: 13,
            color: 'var(--fg-subtle)',
            margin: '0 0 8px',
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}>
            {fmtDate(article.published_at)}
          </p>
        )}

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 40,
          margin: '0 0 14px',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: 'var(--fg)',
        }}>
          {article.title}
        </h1>

        {article.summary && (
          <p style={{
            fontSize: 18,
            color: 'var(--fg-muted)',
            lineHeight: 1.6,
            marginBottom: 36,
          }}>
            {article.summary}
          </p>
        )}

        <article style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '36px 40px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        </article>

        <RatingWidget
          article={article}
          token={token}
          isOwner={isOwner}
          readDwellScroll={readDwellScroll}
        />

        {/* Lesson-booking conversion card — themed equivalent of the
            default ArticleReader's bottom CTA. Only renders when the
            tutor actually has a way to take a booking (trial offered
            OR a featured pack). Disappears cleanly otherwise. */}
        {!isOwner && (offersTrial || featuredPack) && (
          <section
            className="panel"
            style={{
              marginTop: 36,
              padding: 0,
              overflow: 'hidden',
              background: 'var(--aegean-700)',
              border: 'none',
              color: '#fff',
              position: 'relative',
            }}
          >
            <div style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 40% 38%, rgba(249,225,164,0.45), rgba(249,225,164,0) 70%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'relative',
              padding: '32px 36px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
                <div style={{
                  flex: '0 0 56px',
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: 'rgba(232,184,75,0.22)',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 24,
                  color: 'var(--honey-400)',
                }}>
                  {firstName.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'var(--honey-400)',
                    margin: 0,
                  }}>
                    Liked this piece?
                  </p>
                  <h3 style={{
                    margin: '8px 0 0',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 26,
                    lineHeight: 1.15,
                    letterSpacing: '-0.015em',
                  }}>
                    Take a lesson with{' '}
                    <em style={{ color: 'var(--honey-400)', fontStyle: 'italic' }}>
                      {firstName}.
                    </em>
                  </h3>
                  <p style={{
                    margin: '12px 0 0',
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: 'rgba(255,255,255,0.85)',
                    maxWidth: '38ch',
                  }}>
                    The voice you've been reading is also the voice you'll learn from.
                    {offersTrial && ' Most new students start with a free trial chat.'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
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
                    className="v-btn v-btn-gold"
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
                    className="v-btn v-btn-secondary"
                    style={{
                      background: 'transparent',
                      border: '1.5px solid rgba(255,255,255,0.3)',
                      color: '#fff',
                      boxShadow: 'none',
                    }}
                  >
                    Book a lesson
                    <span style={{ marginLeft: 6, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
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
          <VassoBookingDialog
            pack={bookingPack}
            tutorDisplayName={tutor?.display_name || firstName}
            onClose={() => setBookingPack(null)}
          />
        )}
      </main>
    </VassoLayout>
  );
};

export default VassoArticleReader;
