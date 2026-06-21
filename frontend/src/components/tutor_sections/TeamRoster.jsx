import React, { useEffect, useState } from 'react';
import client from '../../api/client';

// Roster of every active tutor on the current tenant's TutorTeam.
// Backend resolves the tenant → team via CurrentTutor; null response
// means "tenant tutor isn't part of a team" and we hide the section
// entirely (a solo tutor's site shouldn't render an empty team).

const TeamRoster = ({ content }) => {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/tutor/public-team');
        if (!cancelled) setTeam(res.data || null);
      } catch {
        if (!cancelled) setTeam(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!team || team.members.length === 0) return null;

  const eyebrow = content?.eyebrow?.trim() || 'Our team';
  const title = content?.title?.trim() || team.team_name;
  const sub = content?.sub?.trim() || null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <p className="font-sans text-[11px] font-bold uppercase tracking-[0.22em] text-kotoba-primary mb-3">
          {eyebrow}
        </p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-kotoba-text leading-tight tracking-[-0.02em]">
          {title}
        </h2>
        {sub && (
          <p className="mt-3 text-base text-kotoba-text/70 leading-relaxed">
            {sub}
          </p>
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {team.members.map((m) => (
          <MemberCard key={m.tutor_slug} member={m} />
        ))}
      </div>
    </section>
  );
};

const MemberCard = ({ member }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (member.full_name || member.tutor_slug || '?').charAt(0).toUpperCase();
  // Cross-tenant link — each member has their own subdomain. Use the
  // host swap rather than React Router so the navigation crosses
  // origins and picks up the member's own auth + theme.
  const href = `https://${member.tutor_slug}.${typeof window !== 'undefined' ? window.location.hostname.split('.').slice(-2).join('.') : 'kotobaseed.net'}/`;
  return (
    <a
      href={href}
      className="group block bg-white rounded-3xl p-6 shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-200 ease-soft"
    >
      <div className="flex items-center gap-4 mb-4">
        {member.photo_url && !imgFailed ? (
          <img
            src={member.photo_url}
            alt={member.full_name}
            onError={() => setImgFailed(true)}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-kotoba-primary/10 flex items-center justify-center text-2xl font-bold text-kotoba-primary">
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-kotoba-text truncate">
            {member.full_name}
          </h3>
          {member.is_owner && (
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-kotoba-primary/80 mt-0.5">
              Director
            </p>
          )}
        </div>
      </div>
      {member.headline && (
        <p className="text-sm font-medium text-kotoba-text/85 mb-2">
          {member.headline}
        </p>
      )}
      {member.bio && (
        <p className="text-sm text-kotoba-text/65 leading-relaxed line-clamp-3">
          {member.bio}
        </p>
      )}
      <span className="mt-4 inline-flex items-center font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-kotoba-text/70 group-hover:text-kotoba-primary transition-colors">
        Visit profile
        <span
          aria-hidden
          className="ml-2 transition-transform duration-200 group-hover:translate-x-0.5"
        >
          →
        </span>
      </span>
    </a>
  );
};

export default TeamRoster;
