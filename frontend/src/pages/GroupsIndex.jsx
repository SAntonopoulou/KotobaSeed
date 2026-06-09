import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useReveal } from '../hooks/landingAnimations';
import { getErrorMessage } from '../utils/errors';

// Apex /groups — index of every active language community.
// Phase 1A: read-only list with member + tutor count.

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

const GroupCard = ({ g, onJoin, busyJoining }) => {
  const navigate = useNavigate();
  return (
    <div className="rounded-3xl bg-white shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-500 ease-soft overflow-hidden h-full flex flex-col">
      {/* Cover — clickable, navigates to detail */}
      <Link
        to={`/groups/${g.slug}`}
        className="block h-32 relative group/cover"
        style={{
          background: g.cover_color
            ? `linear-gradient(135deg, ${g.cover_color} 0%, rgba(255,255,255,0.6) 100%)`
            : 'radial-gradient(ellipse 60% 70% at 30% 30%, rgb(var(--kotoba-secondary-rgb) / 0.40), transparent 70%), rgb(var(--kotoba-primary-rgb) / 0.10)',
        }}
        aria-label={`Visit the ${g.language_name} group`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-5xl font-bold text-kotoba-primary/40 transition-transform duration-500 group-hover/cover:scale-110">
            {g.language_name[0]}
          </span>
        </div>
      </Link>
      <div className="p-6 flex-1 flex flex-col">
        <Link
          to={`/groups/${g.slug}`}
          className="font-display text-xl font-bold text-kotoba-primary leading-tight tracking-[-0.01em] hover:underline"
        >
          {g.language_name}
        </Link>
        {g.description && (
          <p className="mt-2 text-sm text-kotoba-text/75 leading-relaxed line-clamp-2">
            {g.description}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-kotoba-primary" />
            {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{g.tutor_count} {g.tutor_count === 1 ? 'tutor' : 'tutors'}</span>
        </div>
        <div className="mt-auto pt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onJoin(g)}
            disabled={busyJoining === g.slug}
            className={
              'flex-1 inline-flex items-center justify-center px-4 py-2 rounded-2xl text-sm font-semibold transition-all duration-300 ease-soft disabled:opacity-60 ' +
              (g.is_member
                ? 'bg-white border border-kotoba-primary/25 text-kotoba-primary hover:bg-kotoba-primary/5'
                : 'bg-kotoba-secondary text-kotoba-text shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5')
            }
          >
            {busyJoining === g.slug
              ? '…'
              : g.is_member
              ? 'Joined ✓'
              : 'Join group'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/groups/${g.slug}`)}
            className="group/btn flex-1 inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-kotoba-primary text-white text-sm font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft"
          >
            Visit group
            <span
              className="ml-1.5 transition-transform duration-300 group-hover/btn:translate-x-1"
              aria-hidden="true"
            >
              →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

const GroupsIndex = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyJoining, setBusyJoining] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/groups');
        setGroups(res.data || []);
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load groups.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onJoin = async (g) => {
    if (!token) {
      navigate(`/login?next=${encodeURIComponent('/groups')}`);
      return;
    }
    setBusyJoining(g.slug);
    try {
      if (g.is_member) {
        await client.delete(`/groups/${g.slug}/join`);
        setGroups((xs) =>
          xs.map((x) =>
            x.slug === g.slug
              ? { ...x, is_member: false, member_count: Math.max(0, x.member_count - 1) }
              : x
          )
        );
      } else {
        await client.post(`/groups/${g.slug}/join`);
        setGroups((xs) =>
          xs.map((x) =>
            x.slug === g.slug
              ? { ...x, is_member: true, member_count: x.member_count + 1 }
              : x
          )
        );
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update membership.'));
    } finally {
      setBusyJoining(null);
    }
  };

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
              'radial-gradient(circle, rgba(214,164,47,0.18), transparent 70%)',
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <RevealBlock>
          <header className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              Communities
            </p>
            <h1 className="mt-3 font-display text-5xl sm:text-6xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
              Find your{' '}
              <span className="italic text-kotoba-secondary-dark">language people.</span>
            </h1>
            <p className="mt-5 text-lg text-kotoba-text/75 leading-relaxed">
              Every language group is a hub for tutors and students of that language —
              pinned tutors, a scoped article feed, free to join, more on the way.
            </p>
          </header>
        </RevealBlock>

        {error && (
          <div className="mt-8 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-10 text-kotoba-text/60">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="mt-10 bg-white rounded-3xl shadow-soft p-10 text-center">
            <p className="text-kotoba-text/70">No groups yet. Check back soon.</p>
          </div>
        ) : (
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {groups.map((g, i) => (
              <RevealBlock key={g.id} delay={Math.min(i, 9) * 50}>
                <GroupCard g={g} onJoin={onJoin} busyJoining={busyJoining} />
              </RevealBlock>
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default GroupsIndex;
