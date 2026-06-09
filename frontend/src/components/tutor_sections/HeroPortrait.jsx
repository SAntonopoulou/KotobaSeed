import React from 'react';
import VerifiedCredentialsBadges from '../VerifiedCredentialsBadges';

// Hero section — multiple visual variants the tutor can pick from in the
// page builder. Modernised in the 2026-06-07 sweep: Fraunces display
// serif headlines with italic accents, soft-shadow photo treatment,
// pulsing eyebrow chip, animated background gradient, soft-glow CTAs.

const Photo = ({ tutor, size = 'lg' }) => {
  const cls = {
    sm: 'max-w-xs',
    md: 'max-w-sm',
    lg: 'max-w-md',
    xl: 'max-w-lg',
  }[size];
  if (tutor.photo_url) {
    return (
      <div className={`relative w-full ${cls} mx-auto`}>
        {/* Soft halo behind the photo using the tutor's theme primary. */}
        <div
          aria-hidden="true"
          className="absolute -inset-4 rounded-full opacity-40 blur-2xl"
          style={{
            background:
              'radial-gradient(ellipse 80% 80% at 50% 50%, rgb(var(--kotoba-secondary-rgb) / 0.5), transparent 70%)',
          }}
        />
        <img
          src={tutor.photo_url}
          alt={tutor.display_name}
          className="relative w-full rounded-[2.5rem] shadow-soft-lg object-cover aspect-square"
        />
      </div>
    );
  }
  return (
    <div className={`relative w-full ${cls} mx-auto`}>
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-full opacity-40 blur-2xl"
        style={{
          background:
            'radial-gradient(ellipse 80% 80% at 50% 50%, rgb(var(--kotoba-secondary-rgb) / 0.5), transparent 70%)',
        }}
      />
      <div className="relative w-full rounded-[2.5rem] bg-kotoba-primary/10 aspect-square flex items-center justify-center shadow-soft">
        <span className="font-display text-7xl font-bold text-kotoba-primary/30">
          {tutor.display_name.charAt(0)}
        </span>
      </div>
    </div>
  );
};

// Friendly status chip with a pulsing dot — sits above the headline as
// a calm "yes I'm here, yes I'm taking students" signal.
const EyebrowChip = ({ children, center = false }) => (
  <p
    className={
      'inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-kotoba-primary bg-kotoba-primary/10 rounded-full pl-2.5 pr-4 py-1.5 border border-kotoba-primary/15 ' +
      (center ? 'mx-auto' : '')
    }
  >
    <span className="relative w-1.5 h-1.5 rounded-full bg-kotoba-primary v2-pulse-dot" />
    {children}
  </p>
);

const CTAs = ({ ctaLabel, ctaAnchor, justify = 'start' }) => (
  <div className={`mt-8 flex flex-wrap gap-3 justify-${justify}`}>
    <a
      href={ctaAnchor}
      className="group inline-flex items-center px-7 py-3.5 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft-lg hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
    >
      {ctaLabel}
      <span
        className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
        aria-hidden="true"
      >
        →
      </span>
    </a>
    <a
      href="#about"
      className="inline-flex items-center px-7 py-3.5 rounded-2xl border border-kotoba-primary/25 text-kotoba-primary font-semibold hover:bg-kotoba-primary/5 transition-colors duration-300"
    >
      More about me
    </a>
  </div>
);

const SubheadOrLanguages = ({ subhead, languages, center = false }) => {
  if (subhead) {
    return (
      <p
        className={
          'mt-5 text-lg text-kotoba-text/75 leading-relaxed ' +
          (center ? 'text-center max-w-2xl mx-auto' : 'max-w-xl')
        }
      >
        {subhead}
      </p>
    );
  }
  if (languages.length > 0) {
    return (
      <p
        className={
          'mt-5 text-lg text-kotoba-text/75 ' +
          (center ? 'text-center' : '')
        }
      >
        Teaches{' '}
        <span className="font-display italic font-medium text-kotoba-primary">
          {languages.join(' · ')}
        </span>
      </p>
    );
  }
  return null;
};

// Decorative mesh gradient behind the hero — same primitive used on the
// apex landing, scoped to this section so themed tutors get a
// theme-aware version automatically.
const HeroBackdrop = () => (
  <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
    <div
      className="v2-mesh-blob"
      style={{
        top: '-20%',
        left: '-10%',
        width: '50%',
        height: '70%',
        background:
          'radial-gradient(circle, rgb(var(--kotoba-secondary-rgb) / 0.22), transparent 70%)',
      }}
    />
    <div
      className="v2-mesh-blob v2-mesh-blob-2"
      style={{
        top: '20%',
        right: '-15%',
        width: '45%',
        height: '70%',
        background:
          'radial-gradient(circle, rgb(var(--kotoba-primary-rgb) / 0.10), transparent 70%)',
      }}
    />
  </div>
);

const HeroPortrait = ({ tutor, content }) => {
  const variant = content?.variant || 'portrait_right';
  const headline = content?.headline?.trim() || tutor.display_name;
  const subhead = content?.subhead?.trim() || null;
  const ctaLabel = content?.cta_label?.trim() || 'Book a lesson';
  const ctaAnchor = content?.cta_anchor?.trim() || '#book';
  const languages = tutor._languages || [];
  const bio = content?.bio_override?.trim() || tutor.bio;

  if (variant === 'centered') {
    return (
      <section className="relative isolate">
        <HeroBackdrop />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="flex justify-center mb-8 animate-fade-up">
            <Photo tutor={tutor} size="md" />
          </div>
          <div className="flex justify-center">
            <EyebrowChip>Taking new students</EyebrowChip>
          </div>
          <h1 className="mt-4 font-display text-5xl sm:text-6xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
            {headline}
          </h1>
          <SubheadOrLanguages subhead={subhead} languages={languages} center />
          <VerifiedCredentialsBadges className="mt-5 justify-center" />
          {bio && (
            <p className="mt-7 text-lg text-kotoba-text/80 leading-relaxed whitespace-pre-line max-w-2xl mx-auto">
              {bio}
            </p>
          )}
          <CTAs ctaLabel={ctaLabel} ctaAnchor={ctaAnchor} justify="center" />
        </div>
      </section>
    );
  }

  if (variant === 'minimal') {
    return (
      <section className="relative isolate">
        <HeroBackdrop />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <div className="flex justify-center">
            <EyebrowChip>Taking new students</EyebrowChip>
          </div>
          <h1 className="mt-5 font-display text-6xl sm:text-7xl font-bold text-kotoba-primary leading-[1.02] tracking-[-0.025em]">
            {headline}
          </h1>
          <SubheadOrLanguages subhead={subhead} languages={languages} center />
          <VerifiedCredentialsBadges className="mt-5 justify-center" />
          <CTAs ctaLabel={ctaLabel} ctaAnchor={ctaAnchor} justify="center" />
        </div>
      </section>
    );
  }

  const photoOnLeft = variant === 'portrait_left';

  return (
    <section className="relative isolate">
      <HeroBackdrop />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="grid lg:grid-cols-[1.1fr,1fr] gap-12 lg:gap-16 items-center">
          <div className={photoOnLeft ? 'lg:order-2' : ''}>
            <EyebrowChip>Taking new students</EyebrowChip>
            <h1 className="mt-4 font-display text-5xl sm:text-6xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
              {headline}
            </h1>
            <SubheadOrLanguages subhead={subhead} languages={languages} />
            <VerifiedCredentialsBadges className="mt-5" />
            {bio && (
              <p className="mt-7 text-lg text-kotoba-text/80 leading-relaxed whitespace-pre-line max-w-xl">
                {bio}
              </p>
            )}
            <CTAs ctaLabel={ctaLabel} ctaAnchor={ctaAnchor} />
          </div>
          <div className={photoOnLeft ? '' : 'lg:order-2'}>
            <Photo tutor={tutor} />
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroPortrait;
