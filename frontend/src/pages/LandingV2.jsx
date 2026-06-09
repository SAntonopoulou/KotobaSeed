import React from 'react';
import { Link } from 'react-router-dom';
import { useReveal, useCountUp, useSpotlight } from '../hooks/landingAnimations';

// Modernised landing — sleek SaaS direction (Cal.com / Linear adjacent,
// dialled to fit the warm sage + honey brand). Same content arc as v1.
//
// Modern primitives in use:
// - Animated mesh-gradient blobs behind the hero (CSS keyframes)
// - Floating product-mockup card overlaying the hero photo edge
// - Scroll-triggered fade-up reveals (IntersectionObserver)
// - Count-up on the headline savings number
// - Spotlight-on-hover feature cards (pointer follows radial)
// - Looping language-pill marquee
// - Gradient text on accent phrases, pulsing eyebrow dot
//
// No emoji. Subtle motion that earns its place — not animation for
// its own sake.

// --- Tiny stroke icons used in feature cards --------------------------

const ICON_CLASS = 'w-5 h-5';
const Icon = (paths) => (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="1.5"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={ICON_CLASS}
    {...props}
  >
    {paths}
  </svg>
);
const IconGlobe = Icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
  </>
);
const IconCoin = Icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9.5 9.5a2.5 2.5 0 015 0c0 1.4-1.1 2-2.5 2.5s-2.5 1-2.5 2.5a2.5 2.5 0 005 0" />
  </>
);
const IconVideo = Icon(
  <>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10l5-3v10l-5-3z" />
  </>
);
const IconBook = Icon(
  <>
    <path d="M4 4.5A1.5 1.5 0 015.5 3H11v18H5.5A1.5 1.5 0 014 19.5v-15zM20 4.5A1.5 1.5 0 0018.5 3H13v18h5.5a1.5 1.5 0 001.5-1.5v-15z" />
  </>
);
const IconBadge = Icon(
  <>
    <path d="M12 3l2.2 1.4 2.6-.4.9 2.5 2.4 1-.4 2.6 1.4 2.2-1.4 2.2.4 2.6-2.4 1-.9 2.5-2.6-.4L12 21l-2.2-1.4-2.6.4-.9-2.5-2.4-1 .4-2.6L2.9 12l1.4-2.2-.4-2.6 2.4-1 .9-2.5 2.6.4z" />
    <path d="M9.5 12l2 2 3-4" />
  </>
);
const IconPalette = Icon(
  <>
    <path d="M12 21a9 9 0 110-18 9 9 0 016 2.5c1.4 1.3 1.4 3.3 0 4.5l-1 .9c-1 1-1 2.5 0 3.5 1 1 2.6 1 3.5 0a1.5 1.5 0 010 2.1A9 9 0 0112 21z" />
    <circle cx="8" cy="9" r="1" />
    <circle cx="12" cy="6.5" r="1" />
    <circle cx="16" cy="9" r="1" />
  </>
);
const IconSearch = Icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M16 16l5 5" />
  </>
);
const IconKey = Icon(
  <>
    <circle cx="8" cy="14" r="4" />
    <path d="M11 12l9-9M16 7l3 3M19 4l3 3" />
  </>
);
const IconHandshake = Icon(
  <>
    <path d="M3 12l4-4 3 3 4-4 7 7-3 3-2-2-2 2-2-2-3 3-2-2-4-4z" />
  </>
);

// --- Content ----------------------------------------------------------

const TUTOR_FEATURES = [
  { icon: IconGlobe,   title: 'Your own branded site',          body: 'A real URL — yourname.kotobaseed.net or a custom domain — students bookmark, not yet another tutor card on someone else\'s marketplace.' },
  { icon: IconCoin,    title: '0% lesson fee on Pro',           body: 'A flat €39/month replaces the 15–33% commission marketplaces take. A tutor making €1,500/month keeps an extra €186 every month.' },
  { icon: IconVideo,   title: 'Booking, payments, classroom',   body: 'Daily.co video, Stripe Connect payouts, scheduling, reminders, cancellation rules — all wired together.' },
  { icon: IconBook,    title: 'Articles, modules, homework',    body: 'Sell premium content, auto-assign homework on lesson complete, build modules that teach themselves.' },
  { icon: IconBadge,   title: 'Verified credentials',           body: 'DELE, CELTA, native-speaker certificates show as badges on your site — a trust signal you control.' },
  { icon: IconPalette, title: 'Custom-designed themes',         body: 'Pay our designer for a bespoke site built around your brand. Live within 5–10 business days.' },
];

const STUDENT_FEATURES = [
  { icon: IconSearch,    title: 'Find tutors through their writing',  body: 'Browse free articles, structured modules, and lesson notes. Read first, decide later.', cta: { label: 'Open the discovery feed', href: '/discover' } },
  { icon: IconKey,       title: 'One Plus subscription, every tutor', body: 'Plus unlocks subscribers-only content across every tutor on Kotobaseed. €9/month, cancel any time.', cta: { label: 'See Plus pricing', href: '/pricing' } },
  { icon: IconHandshake, title: 'A real free trial',                  body: 'Most tutors here offer a 15-minute free trial. No card on file. You meet them, you decide.', cta: { label: 'Find a tutor', href: '/library' } },
];

const LANGUAGES = [
  'Spanish', 'Japanese', 'German', 'Greek', 'French', 'Mandarin', 'Italian',
  'Korean', 'Portuguese', 'Arabic', 'Hindi', 'Russian', 'Turkish', 'Polish',
  'Dutch', 'Swedish', 'Vietnamese', 'Thai',
];

// --- Building blocks --------------------------------------------------

const Reveal = ({ children, delay = 0, className = '' }) => {
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

const FeatureCard = ({ icon: IconCmp, title, body, cta, accent = 'primary' }) => {
  const ref = useSpotlight();
  const accentClasses =
    accent === 'subtle'
      ? 'bg-kotoba-background/40 border border-kotoba-text/[0.06]'
      : 'bg-white shadow-soft';
  return (
    <div
      ref={ref}
      className={`v2-spot group rounded-3xl p-6 transition-all duration-500 ease-soft hover:-translate-y-1 hover:shadow-soft-lg ${accentClasses}`}
    >
      <span className="relative inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-kotoba-primary/10 text-kotoba-primary mb-4 transition-transform duration-500 ease-soft group-hover:-translate-y-0.5 group-hover:rotate-[-3deg]">
        <IconCmp />
      </span>
      <h3 className="relative font-display text-xl font-bold text-kotoba-primary leading-tight">
        {title}
      </h3>
      <p className="relative mt-2 text-sm text-kotoba-text/80 leading-relaxed">{body}</p>
      {cta && (
        <Link
          to={cta.href}
          className="relative mt-5 inline-flex items-center text-sm font-semibold text-kotoba-primary gap-2 hover:gap-3 transition-all duration-300"
        >
          {cta.label}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
};

// --- Page -------------------------------------------------------------

const LandingV2 = () => {
  const [savingsRef, savings] = useCountUp(186);

  return (
    <div className="font-sans bg-kotoba-background text-kotoba-text">
      {/* ============ HERO ============ */}
      <div className="relative bg-kotoba-primary overflow-hidden isolate">
        {/* Animated mesh blobs */}
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div
            className="v2-mesh-blob"
            style={{
              top: '-15%',
              left: '-10%',
              width: '60%',
              height: '70%',
              background: 'radial-gradient(circle, rgba(214,164,47,0.55), transparent 70%)',
            }}
          />
          <div
            className="v2-mesh-blob v2-mesh-blob-2"
            style={{
              top: '20%',
              right: '-20%',
              width: '55%',
              height: '80%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.10), transparent 70%)',
            }}
          />
          <div
            className="v2-mesh-blob v2-mesh-blob-3"
            style={{
              bottom: '-20%',
              left: '20%',
              width: '50%',
              height: '60%',
              background: 'radial-gradient(circle, rgba(56,189,248,0.18), transparent 70%)',
            }}
          />
          <div className="v2-noise" />
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="relative z-10 pb-12 sm:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
            <main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-24 lg:px-8 xl:mt-28">
              <Reveal>
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-kotoba-secondary bg-white/10 backdrop-blur-sm rounded-full pl-2.5 pr-4 py-1.5 border border-white/15">
                  <span className="relative w-2 h-2 rounded-full bg-kotoba-secondary v2-pulse-dot" />
                  Now in beta · independent tutors only
                </p>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="mt-6 font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.02] font-bold text-white tracking-[-0.02em]">
                  <span className="block">Teach languages.</span>
                  <span className="block bg-gradient-to-r from-kotoba-secondary via-kotoba-secondary-dark to-kotoba-secondary bg-clip-text text-transparent italic font-medium">
                    Keep what you earn.
                  </span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-6 text-base sm:text-lg md:text-xl text-white/80 sm:max-w-xl lg:mx-0 leading-relaxed">
                  A branded site, scheduling, classroom video, homework, articles,
                  modules, and payments — all in one. 0% lesson fee on Pro instead of
                  the 15–33% the marketplaces take.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    to="/try/tutor"
                    className="group inline-flex items-center justify-center px-7 py-3.5 rounded-2xl text-base font-semibold text-kotoba-text bg-kotoba-secondary shadow-soft-lg hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
                  >
                    Start teaching
                    <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">→</span>
                  </Link>
                  <Link
                    to="/try/student"
                    className="inline-flex items-center justify-center px-7 py-3.5 rounded-2xl border border-white/25 text-base font-semibold text-white hover:bg-white/10 transition-colors duration-300"
                  >
                    Try as a student
                  </Link>
                </div>
              </Reveal>
              <Reveal delay={320}>
                <div className="mt-6 flex items-center gap-3 text-xs text-white/55">
                  <span className="inline-flex -space-x-2">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="w-6 h-6 rounded-full ring-2 ring-kotoba-primary"
                        style={{ background: ['#d6a42f', '#e2b226', '#c45c7c', '#80c4dc'][i] }}
                      />
                    ))}
                  </span>
                  <span>Joined this week — tutors teaching 18 languages</span>
                </div>
              </Reveal>
            </main>
          </div>
        </div>

        {/* Floating product preview — visual interest on the right
            without using a stock photo. Two stacked cards = "your site
            + a booked lesson", which is the product in one glance. */}
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 hidden lg:block">
          <div className="relative h-full flex items-center justify-center">
            <Reveal delay={300}>
              <div className="relative w-[340px] h-[460px] mx-auto">
                <div
                  className="absolute inset-0 rounded-[2.5rem] bg-white/10 backdrop-blur-md border border-white/20 shadow-soft-lg"
                  style={{ transform: 'rotate(-3deg) translate(-20px, 10px)' }}
                />
                <div
                  className="absolute inset-0 rounded-[2.5rem] bg-white shadow-soft-lg p-6 flex flex-col"
                  style={{ transform: 'rotate(2deg)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <span className="ml-auto text-[10px] font-mono text-kotoba-text/40">
                      vasso.kotobaseed.net
                    </span>
                  </div>
                  <div className="mt-5">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                      Today's article
                    </p>
                    <p className="mt-2 font-display text-xl font-bold text-kotoba-primary leading-tight">
                      Greek café idioms — pop song breakdown
                    </p>
                    <div className="mt-3 space-y-2">
                      <div className="h-1.5 bg-kotoba-text/10 rounded-full w-full" />
                      <div className="h-1.5 bg-kotoba-text/10 rounded-full w-[88%]" />
                      <div className="h-1.5 bg-kotoba-text/10 rounded-full w-[94%]" />
                      <div className="h-1.5 bg-kotoba-text/10 rounded-full w-[72%]" />
                    </div>
                    <div className="mt-4 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-kotoba-primary bg-kotoba-primary/10 rounded px-2 py-0.5">
                      Free preview
                    </div>
                  </div>
                  <div className="mt-auto pt-5 border-t border-kotoba-text/[0.06]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-kotoba-secondary/40 flex items-center justify-center font-display font-bold text-kotoba-primary">
                        Β
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-kotoba-text">Tue 18:00 · Conversation</p>
                        <p className="text-[10px] text-kotoba-text/60">Vasso · 45 min · €28</p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-kotoba-primary text-white rounded-full px-2 py-1">
                        Booked
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* ============ LANGUAGE MARQUEE ============ */}
      <div className="bg-kotoba-primary text-white/60 py-4 border-y border-white/5 overflow-hidden">
        <div className="v2-marquee-wrap">
          <div className="v2-marquee">
            {[...LANGUAGES, ...LANGUAGES].map((lang, i) => (
              <span
                key={`${lang}-${i}`}
                className="inline-flex items-center gap-3 px-5 text-sm font-medium tracking-wide"
              >
                <span className="w-1 h-1 rounded-full bg-kotoba-secondary/60" />
                {lang}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ============ THE MATH ============ */}
      <section className="bg-white pt-20 pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              The math
            </p>
            <h2 className="mt-2 font-display text-4xl sm:text-5xl font-bold leading-tight tracking-[-0.015em]">
              A Pro tutor saves{' '}
              <span ref={savingsRef} className="v2-gradient-text tabular-nums">
                €{savings}
              </span>
              <br className="sm:hidden" />
              <span className="block sm:inline"> every month.</span>
            </h2>
            <p className="mt-4 text-lg text-kotoba-text/75">
              Compared to iTalki and Preply, where 15–33% of every lesson goes to the platform.
            </p>
          </Reveal>
          <div className="mt-14 grid sm:grid-cols-3 gap-5">
            {[
              { eyebrow: 'Marketplace',    big: '–€225', sub: 'per month',      foot: '15% commission on €1,500', tone: 'mute' },
              { eyebrow: 'Kotobaseed Pro', big: '€39',   sub: 'flat, 0% lesson fee', foot: 'No commission, ever',   tone: 'gold' },
              { eyebrow: 'Your difference', big: '+€186', sub: 'in your bank',  foot: 'every month',               tone: 'dark' },
            ].map((card, i) => (
              <Reveal key={card.eyebrow} delay={i * 80}>
                <div
                  className={
                    'rounded-3xl p-7 text-center h-full ' +
                    (card.tone === 'gold'
                      ? 'bg-kotoba-secondary/30 shadow-soft sm:-mt-3'
                      : card.tone === 'dark'
                      ? 'bg-kotoba-primary text-white shadow-soft-lg'
                      : 'bg-kotoba-background/60')
                  }
                >
                  <p className={`text-xs uppercase tracking-wider font-bold ${card.tone === 'dark' ? 'text-white/70' : 'text-kotoba-text/60'}`}>
                    {card.eyebrow}
                  </p>
                  <p className={`mt-3 font-display text-4xl font-bold tabular-nums ${
                    card.tone === 'mute' ? 'text-red-700'
                      : card.tone === 'dark' ? 'text-kotoba-secondary'
                      : 'text-kotoba-primary'
                  }`}>
                    {card.big}
                  </p>
                  <p className={`text-sm mt-1 ${card.tone === 'dark' ? 'text-white/80' : 'text-kotoba-text/70'}`}>{card.sub}</p>
                  <p className={`text-xs mt-2 ${card.tone === 'dark' ? 'text-white/60' : 'text-kotoba-text/50'}`}>{card.foot}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FOR TUTORS ============ */}
      <section className="relative bg-kotoba-background pt-20 pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-3xl mx-auto">
            <p className="text-xs uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              For tutors
            </p>
            <h2 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
              Run your whole business{' '}
              <span className="italic">from one tab.</span>
            </h2>
            <p className="mt-4 text-lg text-kotoba-text/75">
              Every tool you actually need to run independent online tutoring — without
              stitching together six SaaS subscriptions.
            </p>
          </Reveal>
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TUTOR_FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <FeatureCard {...f} />
              </Reveal>
            ))}
          </div>
          <div className="mt-14 text-center">
            <Link
              to="/help/tutor-getting-started"
              className="group inline-flex items-center px-7 py-3.5 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft"
            >
              Read the getting-started guide
              <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ============ CREATOR REVENUE ============ */}
      <section className="relative bg-kotoba-background pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative rounded-3xl bg-kotoba-primary text-white shadow-soft-lg overflow-hidden isolate">
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10"
                style={{
                  background:
                    'radial-gradient(ellipse 50% 70% at 100% 0%, rgba(214,164,47,0.30), transparent 60%),' +
                    'radial-gradient(ellipse 40% 40% at 0% 100%, rgba(255,255,255,0.05), transparent 70%)',
                }}
              />
              <div className="v2-noise" />
              <div className="relative p-8 sm:p-12">
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary">
                  Creator revenue
                </p>
                <h2 className="mt-2 font-display text-4xl sm:text-5xl font-bold leading-tight tracking-[-0.015em]">
                  Write once,{' '}
                  <span className="italic text-kotoba-secondary">earn forever.</span>
                </h2>
                <p className="mt-5 text-base sm:text-lg text-white/85 leading-relaxed max-w-2xl">
                  Articles and modules are how tutors on Kotobaseed build a second income
                  stream alongside live lessons. You set the price; we take a flat 10% on
                  article sales and a tier-scaled fee on modules. Plus subscribers reading
                  your premium articles earn you a share of the monthly creator pool.
                </p>
                <div className="mt-8 grid sm:grid-cols-3 gap-4 sm:gap-5">
                  <div className="bg-white/[0.07] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                    <p className="font-mono text-xs font-bold tracking-widest text-kotoba-secondary">
                      PIECEMEAL ARTICLES
                    </p>
                    <p className="mt-3 font-display text-3xl font-bold tabular-nums">
                      You keep 90%
                    </p>
                    <p className="mt-1 text-sm text-white/75 leading-relaxed">
                      Flat 10% platform fee on every Free student's one-off article purchase.
                    </p>
                  </div>
                  <div className="bg-white/[0.07] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                    <p className="font-mono text-xs font-bold tracking-widest text-kotoba-secondary">
                      LESSON MODULES
                    </p>
                    <p className="mt-3 font-display text-3xl font-bold tabular-nums">
                      Up to 100%
                    </p>
                    <p className="mt-1 text-sm text-white/75 leading-relaxed">
                      Free 90% · Plus 93% · Pro 95% · Business 100%. The fee drops as your
                      tier climbs.
                    </p>
                  </div>
                  <div className="bg-white/[0.07] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                    <p className="font-mono text-xs font-bold tracking-widest text-kotoba-secondary">
                      PLUS-SUBSCRIBER READS
                    </p>
                    <p className="mt-3 font-display text-3xl font-bold tabular-nums">
                      30% pool
                    </p>
                    <p className="mt-1 text-sm text-white/75 leading-relaxed">
                      30% of all Plus revenue is split monthly among creators by share of
                      real (dwell-verified) reads.
                    </p>
                  </div>
                </div>
                <p className="mt-6 text-xs text-white/55 leading-relaxed max-w-2xl">
                  Articles can be public, subscriber-only (Plus + piecemeal), or
                  module-exclusive — sold only as part of a paid module. You pick the
                  shape; we handle the payout.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ FOR STUDENTS ============ */}
      <section className="bg-white pt-20 pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-3xl mx-auto">
            <p className="text-xs uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              For students
            </p>
            <h2 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
              Read first,{' '}
              <span className="italic text-kotoba-secondary-dark">pick a tutor second.</span>
            </h2>
            <p className="mt-4 text-lg text-kotoba-text/75">
              Forget scrolling through profile photos. Browse what tutors actually write
              and teach. If the voice fits, book the lesson.
            </p>
          </Reveal>
          <div className="mt-14 grid md:grid-cols-3 gap-5">
            {STUDENT_FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 70}>
                <FeatureCard {...f} accent="subtle" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FLYWHEEL ============ */}
      <section className="relative bg-kotoba-primary text-white py-24 overflow-hidden isolate">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div
            className="v2-mesh-blob v2-mesh-blob-3"
            style={{
              top: '-10%',
              right: '-10%',
              width: '55%',
              height: '80%',
              background: 'radial-gradient(circle, rgba(214,164,47,0.30), transparent 70%)',
            }}
          />
          <div className="v2-noise" />
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.18em] font-bold text-kotoba-secondary">
              The flywheel
            </p>
            <h2 className="mt-2 font-display text-4xl sm:text-5xl font-bold leading-tight tracking-[-0.015em]">
              Write once,{' '}
              <span className="italic text-kotoba-secondary">get students forever.</span>
            </h2>
            <p className="mt-5 text-lg text-white/80 max-w-2xl mx-auto leading-relaxed">
              Every article and module you publish appears in the apex discovery feed and
              on your personal site. Students searching for the exact question you
              answered land on your work directly.
            </p>
          </Reveal>
          <div className="mt-12 grid sm:grid-cols-3 gap-4 sm:gap-5 text-left">
            {[
              { n: '01', title: 'You write',     body: 'A grammar tip, a culture note, a study habit. Anything your students keep asking.' },
              { n: '02', title: 'They find you', body: 'Through the discovery feed, the marketplace, or Google searching the exact question you answered.' },
              { n: '03', title: 'They book',     body: 'Trial, paid lesson, subscription. You keep 100% on Pro.' },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 100}>
                <div className="bg-white/[0.06] backdrop-blur-sm rounded-3xl p-6 border border-white/10 h-full">
                  <p className="font-mono text-sm font-semibold text-kotoba-secondary tracking-wider">{step.n}</p>
                  <p className="mt-3 font-display font-bold text-xl">{step.title}</p>
                  <p className="mt-2 text-sm text-white/80 leading-relaxed">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <Link
              to="/try/tutor"
              className="group mt-14 inline-flex items-center px-7 py-3.5 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
            >
              Try teaching here — no card needed
              <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">→</span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="bg-white py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
              Two ways in.
            </h2>
          </Reveal>
          <div className="mt-12 grid md:grid-cols-2 gap-5 text-left">
            {[
              { eyebrow: 'For tutors',   title: '€39/month on Pro', body: '0% lesson fee. Everything you need. 14-day free trial — card required, cancel any time.', cta: { label: 'See all plans', href: '/pricing' }, tone: 'background' },
              { eyebrow: 'For students', title: 'Free to start',    body: 'Browse content, message tutors, book a trial. Plus is €9/month if you want to unlock more.', cta: { label: 'Browse the feed', href: '/discover' }, tone: 'gold' },
            ].map((card, i) => (
              <Reveal key={card.eyebrow} delay={i * 100}>
                <div className={`rounded-3xl p-7 h-full ${card.tone === 'gold' ? 'bg-kotoba-secondary/25' : 'bg-kotoba-background/40'}`}>
                  <p className="text-xs uppercase tracking-[0.18em] font-bold text-kotoba-text/60">{card.eyebrow}</p>
                  <h3 className="mt-2 font-display text-2xl font-bold text-kotoba-primary leading-tight">{card.title}</h3>
                  <p className="mt-3 text-sm text-kotoba-text/80 leading-relaxed">{card.body}</p>
                  <Link to={card.cta.href} className="mt-5 inline-flex items-center text-sm font-semibold text-kotoba-primary gap-2 hover:gap-3 transition-all duration-300">
                    {card.cta.label} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingV2;
