import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useReveal } from '../hooks/landingAnimations';
import { getErrorMessage } from '../utils/errors';

const formatRelative = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

const ThreadComposer = ({ slug, onCreated }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await client.post(`/groups/${slug}/threads`, {
        title: title.trim(),
        body_markdown: body.trim(),
      });
      setOpen(false);
      setTitle('');
      setBody('');
      onCreated?.(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not post thread.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center px-5 py-2.5 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
      >
        + Start a thread
      </button>
    );
  }

  return (
    <div className="rounded-3xl border border-kotoba-primary/20 bg-kotoba-primary/[0.03] p-5 space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="Thread title"
        className="w-full px-4 py-2.5 border border-kotoba-text/15 rounded-2xl text-base font-display font-bold text-kotoba-primary focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
      />
      <textarea
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={8000}
        placeholder="What's on your mind? A question, a tip, a study plan…"
        className="w-full px-4 py-2.5 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle('');
            setBody('');
            setError('');
          }}
          disabled={busy}
          className="px-4 py-2 text-sm text-kotoba-text/65 hover:text-kotoba-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !title.trim() || !body.trim()}
          className="px-5 py-2 rounded-2xl bg-kotoba-primary text-white text-sm font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-50"
        >
          {busy ? 'Posting…' : 'Post thread'}
        </button>
      </div>
    </div>
  );
};

const ThreadRow = ({ t, slug }) => (
  <Link
    to={`/groups/${slug}/threads/${t.id}`}
    className="block bg-white rounded-3xl shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-500 ease-soft p-5"
  >
    <div className="flex gap-4">
      {t.author.avatar_url ? (
        <img
          src={t.author.avatar_url}
          alt={t.author.name || ''}
          className="flex-shrink-0 w-10 h-10 rounded-2xl object-cover"
        />
      ) : (
        <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-kotoba-secondary/30 flex items-center justify-center font-display font-bold text-kotoba-primary">
          {(t.author.name || '?').charAt(0)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display text-base font-bold text-kotoba-primary leading-tight">
            {t.title}
          </h3>
          {t.author.is_tutor && (
            <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-secondary-dark bg-kotoba-secondary/30 px-1.5 py-0.5 rounded">
              Tutor
            </span>
          )}
          {t.archived && (
            <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55 bg-kotoba-text/10 px-1.5 py-0.5 rounded">
              Archived
            </span>
          )}
          {t.hidden && (
            <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
              Hidden
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-kotoba-text/75 line-clamp-2 leading-relaxed">
          {t.excerpt}
        </p>
        <div className="mt-2 flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/50">
          <span>{t.author.name || 'Reader'}</span>
          <span aria-hidden="true">·</span>
          <span>{t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}</span>
          <span aria-hidden="true">·</span>
          <span>updated {formatRelative(t.last_reply_at)}</span>
        </div>
      </div>
    </div>
  </Link>
);

const GroupThreads = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await client.get(`/groups/${slug}/threads`);
      setThreads(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load threads.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <main className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-6">
        <RevealBlock>
          <Link
            to={`/groups/${slug}`}
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55 hover:text-kotoba-primary"
          >
            <span aria-hidden="true">←</span> Back to group
          </Link>
          <header className="mt-4">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              Threads
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-tight tracking-[-0.02em]">
              The conversation
            </h1>
            <p className="mt-3 text-base text-kotoba-text/75 leading-relaxed">
              Members and tutors of this group post questions, tips, and study plans.
              Sort is by most-recent activity.
            </p>
          </header>
        </RevealBlock>

        {token && (
          <RevealBlock>
            <ThreadComposer
              slug={slug}
              onCreated={(t) => navigate(`/groups/${slug}/threads/${t.id}`)}
            />
          </RevealBlock>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-kotoba-text/60">Loading…</p>
        ) : threads.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-soft p-10 text-center">
            <p className="text-kotoba-text/70">
              No threads yet. {token ? 'Be the first.' : 'Sign in to start one.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {threads.map((t, i) => (
              <RevealBlock key={t.id} delay={Math.min(i, 9) * 40}>
                <li>
                  <ThreadRow t={t} slug={slug} />
                </li>
              </RevealBlock>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
};

export default GroupThreads;
