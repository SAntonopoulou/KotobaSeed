import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useReveal } from '../hooks/landingAnimations';
import { getErrorMessage } from '../utils/errors';

const formatDateTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
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

const AuthorBlock = ({ a }) => (
  <div className="flex items-center gap-3">
    {a.avatar_url ? (
      <img
        src={a.avatar_url}
        alt={a.name || ''}
        className="w-10 h-10 rounded-2xl object-cover"
      />
    ) : (
      <div className="w-10 h-10 rounded-2xl bg-kotoba-secondary/30 flex items-center justify-center font-display font-bold text-kotoba-primary">
        {(a.name || '?').charAt(0)}
      </div>
    )}
    <div>
      <p className="font-display font-bold text-sm text-kotoba-primary leading-tight">
        {a.name || 'Reader'}
      </p>
      {a.is_tutor && (
        <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-secondary-dark">
          Tutor
        </span>
      )}
    </div>
  </div>
);

const GroupThreadDetail = () => {
  const { slug, threadId } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await client.get(`/groups/${slug}/threads/${threadId}`);
      setThread(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Thread not found.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, threadId]);

  const submitReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await client.post(`/groups/${slug}/threads/${threadId}/replies`, {
        body_markdown: reply.trim(),
      });
      setReply('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not post reply.'));
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!window.confirm('Archive this thread? No new replies will be allowed.')) return;
    try {
      await client.post(`/groups/${slug}/threads/${threadId}/archive`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not archive.'));
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this thread? Replies are deleted too.')) return;
    try {
      await client.delete(`/groups/${slug}/threads/${threadId}`);
      navigate(`/groups/${slug}/threads`);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete.'));
    }
  };

  const removeReply = async (r) => {
    if (!window.confirm('Delete your reply?')) return;
    try {
      await client.delete(`/groups/${slug}/threads/${threadId}/replies/${r.id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete reply.'));
    }
  };

  if (loading) {
    return (
      <div className="font-sans min-h-screen bg-kotoba-background flex items-center justify-center">
        <p className="text-kotoba-text/60">Loading…</p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="font-sans min-h-screen bg-kotoba-background flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-soft p-8 max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-kotoba-primary">Thread not found</h1>
          <p className="mt-2 text-sm text-kotoba-text/70">{error}</p>
          <Link
            to={`/groups/${slug}/threads`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-kotoba-primary hover:gap-2.5 transition-all"
          >
            <span aria-hidden="true">←</span> Back to threads
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-5">
        <Link
          to={`/groups/${slug}/threads`}
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55 hover:text-kotoba-primary"
        >
          <span aria-hidden="true">←</span> All threads
        </Link>

        <RevealBlock>
          <article className="bg-white rounded-3xl shadow-soft p-7 sm:p-9">
            <header>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
                  {thread.title}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  {thread.archived && (
                    <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55 bg-kotoba-text/10 px-2 py-0.5 rounded">
                      Archived
                    </span>
                  )}
                  {thread.hidden && (
                    <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                      Hidden
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                <AuthorBlock a={thread.author} />
                <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
                  {formatDateTime(thread.created_at)}
                </span>
              </div>
            </header>
            <p className="mt-6 text-base text-kotoba-text/85 leading-relaxed whitespace-pre-line">
              {thread.body_markdown}
            </p>
            {thread.is_own && (
              <div className="mt-6 pt-4 border-t border-kotoba-text/[0.06] flex items-center gap-3 text-xs">
                {!thread.archived && (
                  <button
                    type="button"
                    onClick={archive}
                    className="text-kotoba-text/65 hover:text-kotoba-text hover:underline"
                  >
                    Archive thread
                  </button>
                )}
                <button
                  type="button"
                  onClick={remove}
                  className="text-red-600 hover:text-red-700 hover:underline"
                >
                  Delete thread
                </button>
              </div>
            )}
          </article>
        </RevealBlock>

        {/* Replies */}
        <section className="space-y-3">
          {thread.replies.length === 0 ? (
            <p className="text-sm text-kotoba-text/55 text-center py-6">
              No replies yet.
            </p>
          ) : (
            thread.replies.map((r, i) => (
              <RevealBlock key={r.id} delay={i * 40}>
                <div
                  className={
                    'bg-white rounded-3xl shadow-soft p-6 ' +
                    (r.hidden ? 'opacity-60' : '')
                  }
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <AuthorBlock a={r.author} />
                    <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
                      {formatDateTime(r.created_at)}
                    </span>
                  </div>
                  <p
                    className={
                      'mt-3 text-sm leading-relaxed whitespace-pre-line ' +
                      (r.hidden
                        ? 'text-kotoba-text/45 italic'
                        : 'text-kotoba-text/85')
                    }
                  >
                    {r.body_markdown}
                  </p>
                  {r.is_own && !r.hidden && (
                    <div className="mt-3 text-xs">
                      <button
                        type="button"
                        onClick={() => removeReply(r)}
                        className="text-red-600 hover:underline"
                      >
                        Delete reply
                      </button>
                    </div>
                  )}
                </div>
              </RevealBlock>
            ))
          )}
        </section>

        {/* Composer */}
        {thread.can_reply && (
          <RevealBlock>
            <div className="bg-white rounded-3xl shadow-soft p-6">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark mb-2">
                Add a reply
              </p>
              <textarea
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={4000}
                placeholder="Your reply…"
                className="w-full px-4 py-2.5 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/45">
                  {reply.length}/4000
                </span>
                <button
                  type="button"
                  onClick={submitReply}
                  disabled={busy || !reply.trim()}
                  className="group inline-flex items-center px-5 py-2 rounded-2xl bg-kotoba-primary text-white text-sm font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-50"
                >
                  {busy ? 'Posting…' : 'Post reply'}
                  <span
                    className="ml-1.5 transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </button>
              </div>
            </div>
          </RevealBlock>
        )}

        {!thread.can_reply && thread.archived && (
          <p className="text-center text-sm text-kotoba-text/55 italic">
            Thread is archived — replies closed.
          </p>
        )}
        {!thread.can_reply && !thread.archived && !token && (
          <div className="bg-white rounded-3xl shadow-soft p-6 text-center">
            <p className="text-sm text-kotoba-text/70">
              <Link to="/login" className="text-kotoba-primary font-semibold hover:underline">
                Sign in
              </Link>{' '}
              to reply.
            </p>
          </div>
        )}
        {!thread.can_reply && !thread.archived && token && (
          <div className="bg-white rounded-3xl shadow-soft p-6 text-center">
            <p className="text-sm text-kotoba-text/70">
              You need to be a member of this group to reply.{' '}
              <Link to={`/groups/${slug}`} className="text-kotoba-primary font-semibold hover:underline">
                Join the group
              </Link>{' '}
              first.
            </p>
          </div>
        )}
      </div>
    </main>
  );
};

export default GroupThreadDetail;
