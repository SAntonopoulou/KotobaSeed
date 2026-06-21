import React from 'react';
import { Link } from 'react-router-dom';
import { isDemoEnv } from '../hooks/useTenant';

// /try landing — the role chooser shown to signed-out visitors on the
// public demo host (demo.kotobaseed.net). On the real apex,
// kotobaseed.net renders the marketing Landing instead.
//
// Two large cards: "Try as a tutor" and "Try as a student". Each goes
// to /try/<role> where the Try.jsx page provisions a passwordless
// seeded demo account and drops the visitor into the right role.

const TryLanding = () => (
  <div className="min-h-screen bg-kotoba-background/60 flex flex-col">
    <main className="flex-1">
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-12 text-center">
        <p className="font-sans text-[11px] font-bold uppercase tracking-[0.22em] text-kotoba-primary mb-6">
          Demo · No card, no signup
        </p>
        <h1
          className="text-kotoba-text mb-5"
          style={{
            fontFamily: 'Fraunces, Lora, Georgia, serif',
            fontWeight: 600,
            fontSize: 'clamp(2.5rem, 5vw, 4rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
          }}
        >
          Try Kotobaseed like you'd actually use it.
        </h1>
        <p
          className="text-kotoba-text/70 max-w-2xl mx-auto"
          style={{
            fontFamily: 'Fraunces, Lora, Georgia, serif',
            fontStyle: 'italic',
            fontSize: '1.125rem',
            lineHeight: 1.55,
          }}
        >
          Pick a role. We'll spin up a real seeded account so you can
          poke at every screen, edit anything, and only convert if it
          feels worth it.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20 grid gap-6 md:grid-cols-2">
        <RoleCard
          role="tutor"
          eyebrow="For independent tutors"
          headline="Try teaching here."
          deck="Built around how you actually work."
          bullets={[
            'A sample tutor site with your bio + a portrait',
            'Two published articles + one paid module',
            'A lesson pack, a few followers, a touch of revenue',
            'Edit anything — nothing goes live unless you convert',
          ]}
          to="/try/tutor"
          cta="Try as a tutor"
        />
        <RoleCard
          role="student"
          eyebrow="For students"
          headline="Try learning here."
          deck="Browse like a real student would."
          bullets={[
            'You land in Discover with a followed tutor',
            'Rate articles, browse modules, buy a sample pack',
            'Reading history pre-populated so the feed feels alive',
            'No card needed; conversion is the email-collect later',
          ]}
          to="/try/student"
          cta="Try as a student"
        />
      </section>

      <section className="max-w-2xl mx-auto px-6 pb-20 text-center">
        <p
          className="text-kotoba-text/60"
          style={{
            fontFamily: 'Fraunces, Lora, Georgia, serif',
            fontStyle: 'italic',
            fontSize: '0.9375rem',
          }}
        >
          Already have a real account?{' '}
          {/* On demo, /login redirects back to /try (sealed flow), so the
              escape hatch must leave demo entirely — point at the apex's
              real auth page. On the apex this stays as an internal link. */}
          {isDemoEnv() ? (
            <a
              href="https://kotobaseed.net/login"
              className="text-kotoba-primary underline decoration-kotoba-primary/40 hover:decoration-kotoba-primary underline-offset-4"
            >
              Sign in
            </a>
          ) : (
            <Link
              to="/login"
              className="text-kotoba-primary underline decoration-kotoba-primary/40 hover:decoration-kotoba-primary underline-offset-4"
            >
              Sign in
            </Link>
          )}
          .
        </p>
      </section>
    </main>
  </div>
);

const RoleCard = ({ role, eyebrow, headline, deck, bullets, to, cta }) => (
  <Link
    to={to}
    className="group block bg-white rounded-3xl p-10 shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-200 ease-soft"
  >
    <p className="font-sans text-[11px] font-bold uppercase tracking-[0.22em] text-kotoba-primary mb-4">
      {eyebrow}
    </p>
    <h2
      className="text-kotoba-text mb-2"
      style={{
        fontFamily: 'Fraunces, Lora, Georgia, serif',
        fontWeight: 600,
        fontSize: 'clamp(1.75rem, 3vw, 2.25rem)',
        letterSpacing: '-0.02em',
        lineHeight: 1.15,
      }}
    >
      {headline}
    </h2>
    <p
      className="text-kotoba-text/65 mb-6"
      style={{
        fontFamily: 'Fraunces, Lora, Georgia, serif',
        fontStyle: 'italic',
        fontSize: '1rem',
      }}
    >
      {deck}
    </p>
    <ul className="space-y-2 mb-8 text-kotoba-text/75 text-[0.9375rem] font-medium">
      {bullets.map((b, i) => (
        <li key={i} className="flex gap-2.5 leading-snug">
          <span
            aria-hidden
            className="mt-2 inline-block w-1 h-1 rounded-full bg-kotoba-primary/60 flex-shrink-0"
          />
          <span>{b}</span>
        </li>
      ))}
    </ul>
    <span
      className="inline-flex items-center gap-2 font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-kotoba-text group-hover:text-kotoba-primary transition-colors"
    >
      {cta}
      <span
        aria-hidden
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      >
        →
      </span>
    </span>
  </Link>
);

export default TryLanding;
