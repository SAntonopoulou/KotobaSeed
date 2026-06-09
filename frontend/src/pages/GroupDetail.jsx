import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useReveal } from '../hooks/landingAnimations';
import { tutorSiteUrl } from '../hooks/useTenant';
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

// Apex /groups/:slug — language group detail page.
// Phase 1A: hero, pinned tutors, recent article feed, join/leave.
// Phases 1B+ add comments + ratings + cohorts + threads + leaderboard.

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

const TutorCard = ({ t }) => {
  const siteUrl = t.tutor_slug ? tutorSiteUrl(t.tutor_slug, '/') : null;
  const Wrapper = ({ children }) =>
    siteUrl ? (
      <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="block h-full">
        {children}
      </a>
    ) : (
      <div className="h-full">{children}</div>
    );
  return (
    <Wrapper>
      <div className="group relative bg-white rounded-3xl shadow-soft hover:shadow-soft-lg hover:-translate-y-1 transition-all duration-500 ease-soft p-5 h-full flex flex-col">
        {t.pinned && (
          <span className="absolute top-3 right-3 text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-primary bg-kotoba-primary/10 px-2 py-0.5 rounded">
            Pinned
          </span>
        )}
        <div className="flex items-center gap-3">
          {t.photo_url ? (
            <img
              src={t.photo_url}
              alt={t.display_name || 'Tutor'}
              className="w-12 h-12 rounded-2xl object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-kotoba-secondary/30 flex items-center justify-center font-display text-xl font-bold text-kotoba-primary">
              {(t.display_name || '?').charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-kotoba-primary leading-tight truncate">
              {t.display_name || 'Tutor'}
            </p>
            {t.tutor_slug && (
              <p className="text-xs text-kotoba-text/55 font-mono truncate">
                {t.tutor_slug}.kotobaseed.net
              </p>
            )}
          </div>
        </div>
        {t.bio_excerpt && (
          <p className="mt-3 text-sm text-kotoba-text/75 leading-relaxed line-clamp-3 flex-grow">
            {t.bio_excerpt}
          </p>
        )}
        <p className="mt-4 inline-flex items-center text-xs font-semibold text-kotoba-primary gap-1.5 group-hover:gap-2.5 transition-all">
          Visit site <span aria-hidden="true">→</span>
        </p>
      </div>
    </Wrapper>
  );
};

const ArticleCard = ({ a }) => {
  const articleUrl = a.tutor_slug
    ? tutorSiteUrl(a.tutor_slug, `/articles/${a.slug}`)
    : '#';
  return (
    <a
      href={articleUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-white rounded-3xl shadow-soft hover:shadow-soft-lg hover:-translate-y-1 transition-all duration-500 ease-soft p-6 h-full"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
        <span>{formatDate(a.published_at)}</span>
        {a.tutor_display_name && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-kotoba-primary">{a.tutor_display_name}</span>
          </>
        )}
      </div>
      <h3 className="mt-2 font-display text-lg font-bold text-kotoba-primary leading-tight tracking-[-0.01em]">
        {a.title}
      </h3>
      {a.summary && (
        <p className="mt-2 text-sm text-kotoba-text/75 leading-relaxed line-clamp-3">
          {a.summary}
        </p>
      )}
      <p className="mt-4 inline-flex items-center text-xs font-semibold text-kotoba-primary gap-1.5 group-hover:gap-2.5 transition-all">
        Read article <span aria-hidden="true">→</span>
      </p>
    </a>
  );
};

const CohortCard = ({ c, currentUserId, onBuy }) => {
  const fillPct = Math.min(100, Math.round((c.seats_filled / c.max_seats) * 100));
  const isOwner = currentUserId && c.tutor_id != null && c.has_seat === false &&
    /* surface a hint when viewer is the tutor — we don't get that flag
       directly from the summary, so the buy button is just hidden in
       that case via the onBuy handler. */
    false;
  return (
    <div className="bg-white rounded-3xl shadow-soft hover:shadow-soft-lg hover:-translate-y-1 transition-all duration-500 ease-soft p-6 flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <span
          className={
            'text-[10px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded ' +
            (c.status === 'confirmed'
              ? 'bg-kotoba-primary/15 text-kotoba-primary'
              : 'bg-kotoba-secondary/40 text-kotoba-text')
          }
        >
          {c.status === 'confirmed' ? 'Confirmed' : 'Open'}
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
          {c.tutor_display_name}
        </span>
      </div>
      <h3 className="mt-3 font-display text-xl font-bold text-kotoba-primary leading-tight tracking-[-0.01em]">
        {c.title}
      </h3>
      {c.description && (
        <p className="mt-2 text-sm text-kotoba-text/75 leading-relaxed line-clamp-3">
          {c.description}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-kotoba-text/70">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/50">
            Starts
          </p>
          <p className="mt-0.5 font-display font-bold text-kotoba-text">
            {formatDateTime(c.first_session_at)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/50">
            Format
          </p>
          <p className="mt-0.5 font-display font-bold text-kotoba-text">
            {c.num_lessons} × {c.duration_minutes} min
          </p>
        </div>
      </div>
      {c.lesson_schedule_note && (
        <p className="mt-3 text-xs text-kotoba-text/55 italic">{c.lesson_schedule_note}</p>
      )}
      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
            Seats {c.seats_filled}/{c.max_seats}
          </span>
          {c.min_seats > 1 && c.status === 'open' && (
            <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/45">
              Needs {c.min_seats} to confirm
            </span>
          )}
        </div>
        <div className="h-2 rounded-full bg-kotoba-text/[0.08] overflow-hidden">
          <div
            className="h-full bg-kotoba-primary transition-all"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
      <div className="mt-auto pt-5 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="font-display text-2xl font-bold text-kotoba-primary tabular-nums">
            {formatPrice(c.price_per_seat_cents, c.currency)}
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
            per seat
          </p>
        </div>
        {c.status === 'open' && c.seats_filled < c.max_seats && !c.has_seat && (
          <button
            type="button"
            onClick={() => onBuy(c)}
            className="group inline-flex items-center px-4 py-2 rounded-2xl bg-kotoba-secondary text-kotoba-text text-sm font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
          >
            Take a seat
            <span
              className="ml-1.5 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            >
              →
            </span>
          </button>
        )}
        {c.has_seat && (
          <span className="inline-flex items-center px-3 py-1.5 rounded-2xl bg-kotoba-primary/10 text-kotoba-primary text-xs font-semibold">
            You're in
          </span>
        )}
      </div>
    </div>
  );
};

const LeaderboardCard = ({ rows }) => (
  <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
    <div className="mb-6">
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
        Leaderboard · this month
      </p>
      <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
        Most engaged members
      </h2>
      <p className="mt-3 text-sm text-kotoba-text/70 max-w-xl">
        Points come from real engagement — reading, rating, commenting, posting in
        threads, buying modules, taking lessons. Resets every month.
      </p>
    </div>
    <div className="bg-white rounded-3xl shadow-soft overflow-hidden">
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-kotoba-text/55 text-center">
          No activity yet this month. Be the first to earn points.
        </p>
      ) : (
        <ol className="divide-y divide-kotoba-text/[0.06]">
          {rows.map((r, i) => (
            <li key={r.user_id} className="flex items-center gap-4 px-5 py-3.5">
              <span
                className={
                  'flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center font-display font-bold ' +
                  (i === 0
                    ? 'bg-kotoba-secondary text-kotoba-text shadow-soft'
                    : i < 3
                    ? 'bg-kotoba-secondary/40 text-kotoba-text'
                    : 'bg-kotoba-text/5 text-kotoba-text/55')
                }
              >
                {i + 1}
              </span>
              {r.avatar_url ? (
                <img
                  src={r.avatar_url}
                  alt={r.name || ''}
                  className="w-10 h-10 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-2xl bg-kotoba-primary/15 text-kotoba-primary font-display font-bold flex items-center justify-center">
                  {(r.name || '?').charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-kotoba-primary truncate">
                  {r.name || 'Member'}
                </p>
                {r.badge_count > 0 && (
                  <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
                    {r.badge_count} {r.badge_count === 1 ? 'badge' : 'badges'}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-bold text-kotoba-primary tabular-nums leading-none">
                  {r.points}
                </p>
                <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55 mt-0.5">
                  pts
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  </section>
);

const GroupDetail = () => {
  const { slug } = useParams();
  const { token } = useAuth();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const load = async () => {
    try {
      const res = await client.get(`/groups/${slug}`);
      setGroup(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Group not found.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const buyCohortSeat = async (cohort) => {
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
      return;
    }
    try {
      const res = await client.post(`/cohorts/${cohort.id}/checkout`);
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setError('Could not start checkout.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start checkout.'));
    }
  };

  const toggleMembership = async () => {
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
      return;
    }
    setJoining(true);
    try {
      if (group.is_member) {
        await client.delete(`/groups/${slug}/join`);
        setGroup({ ...group, is_member: false, member_count: Math.max(0, group.member_count - 1) });
      } else {
        await client.post(`/groups/${slug}/join`);
        setGroup({ ...group, is_member: true, member_count: group.member_count + 1 });
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update membership.'));
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="font-sans min-h-screen bg-kotoba-background flex items-center justify-center">
        <p className="text-kotoba-text/60">Loading…</p>
      </div>
    );
  }
  if (!group) {
    return (
      <div className="font-sans min-h-screen bg-kotoba-background flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-soft p-8 max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-kotoba-primary">
            Group not found
          </h1>
          <p className="mt-2 text-sm text-kotoba-text/70">{error || 'Try another group.'}</p>
          <Link
            to="/groups"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-kotoba-primary hover:gap-2.5 transition-all"
          >
            <span aria-hidden="true">←</span> All groups
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background: group.cover_color
              ? `linear-gradient(180deg, ${group.cover_color}40 0%, transparent 80%)`
              : 'radial-gradient(ellipse 70% 60% at 30% 0%, rgba(214,164,47,0.22), transparent 60%), radial-gradient(ellipse 60% 60% at 80% 100%, rgba(22,86,29,0.10), transparent 70%)',
          }}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <Link
            to="/groups"
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55 hover:text-kotoba-primary"
          >
            <span aria-hidden="true">←</span> All groups
          </Link>
          <RevealBlock>
            <div className="mt-6 flex items-start justify-between gap-6 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                  Language community
                </p>
                <h1 className="mt-3 font-display text-5xl sm:text-6xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
                  {group.language_name}
                </h1>
                {group.description && (
                  <p className="mt-5 text-lg text-kotoba-text/80 leading-relaxed max-w-2xl">
                    {group.description}
                  </p>
                )}
                <div className="mt-5 flex items-center gap-3 text-sm text-kotoba-text/65">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-kotoba-primary" />
                    {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{group.tutor_count} {group.tutor_count === 1 ? 'tutor' : 'tutors'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleMembership}
                disabled={joining}
                className={
                  'group inline-flex items-center justify-center px-7 py-3.5 rounded-2xl font-semibold shadow-soft transition-all duration-300 ease-soft disabled:opacity-50 disabled:hover:translate-y-0 hover:-translate-y-0.5 ' +
                  (group.is_member
                    ? 'bg-white border border-kotoba-primary/30 text-kotoba-primary hover:bg-kotoba-primary/5'
                    : 'bg-kotoba-secondary text-kotoba-text hover:shadow-soft-glow')
                }
              >
                {joining
                  ? 'Updating…'
                  : group.is_member
                  ? 'Leave group'
                  : 'Join group'}
                {!joining && !group.is_member && (
                  <span
                    className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    →
                  </span>
                )}
              </button>
            </div>
          </RevealBlock>
        </div>
      </section>

      {/* Tutors */}
      {(group.tutors?.length ?? 0) > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <RevealBlock>
            <div className="flex items-end justify-between gap-3 flex-wrap mb-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                  Tutors in this group
                </p>
                <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
                  Pinned first, then alphabetical
                </h2>
              </div>
            </div>
          </RevealBlock>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {(group.tutors ?? []).map((t, i) => (
              <RevealBlock key={t.user_id} delay={Math.min(i, 9) * 40}>
                <TutorCard t={t} />
              </RevealBlock>
            ))}
          </div>
        </section>
      )}

      {/* Recent articles */}
      {(group.recent_articles?.length ?? 0) > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <RevealBlock>
            <div className="mb-6">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                Recent reads
              </p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
                From every tutor in the group
              </h2>
            </div>
          </RevealBlock>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {(group.recent_articles ?? []).map((a, i) => (
              <RevealBlock key={a.id} delay={Math.min(i, 9) * 40}>
                <ArticleCard a={a} />
              </RevealBlock>
            ))}
          </div>
        </section>
      )}

      {/* Cohorts */}
      {group.cohorts && group.cohorts.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <RevealBlock>
            <div className="mb-6">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                Cohorts open now
              </p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
                Learn alongside a small group
              </h2>
              <p className="mt-3 text-sm text-kotoba-text/70 max-w-xl">
                Tutors post group lesson series with a fixed schedule and seat cap.
                Pay per seat; if the minimum isn't reached by the deadline you're
                automatically refunded.
              </p>
            </div>
          </RevealBlock>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {(group.cohorts ?? []).map((c, i) => (
              <RevealBlock key={c.id} delay={Math.min(i, 9) * 40}>
                <CohortCard c={c} currentUserId={null} onBuy={buyCohortSeat} />
              </RevealBlock>
            ))}
          </div>
        </section>
      )}

      {/* Threads */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <RevealBlock>
          <Link
            to={`/groups/${slug}/threads`}
            className="group block relative rounded-3xl bg-kotoba-primary text-white shadow-soft-lg overflow-hidden isolate p-8 sm:p-10 hover:-translate-y-0.5 transition-transform duration-300 ease-soft"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10"
              style={{
                background:
                  'radial-gradient(ellipse 60% 70% at 100% 0%, rgba(214,164,47,0.25), transparent 60%)',
              }}
            />
            <div className="v2-noise" />
            <div className="relative flex items-center justify-between gap-6 flex-wrap">
              <div className="max-w-xl">
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary">
                  The conversation
                </p>
                <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold leading-tight tracking-[-0.015em]">
                  Open threads, async Q&A, study plans.
                </h2>
                <p className="mt-3 text-base text-white/85 leading-relaxed">
                  Members and tutors post questions, tips, and corrections.
                  Sort by most-recent activity. Tutors moderate.
                </p>
              </div>
              <span className="inline-flex items-center px-6 py-3 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft transition-transform duration-300 ease-soft group-hover:translate-x-1">
                Browse threads <span className="ml-2" aria-hidden="true">→</span>
              </span>
            </div>
          </Link>
        </RevealBlock>
      </section>

      {/* Leaderboard */}
      <RevealBlock>
        <LeaderboardCard rows={group.leaderboard || []} />
      </RevealBlock>
    </main>
  );
};

export default GroupDetail;
