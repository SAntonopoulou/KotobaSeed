import React from 'react';

// Hero section — multiple visual variants the tutor can pick from in the
// page builder. Default (when no variant set) is portrait_right to match
// the original layout — existing tutors see no change.

const Photo = ({ tutor, size = 'lg' }) => {
  const cls = {
    sm: 'max-w-xs',
    md: 'max-w-sm',
    lg: 'max-w-md',
    xl: 'max-w-lg',
  }[size];
  if (tutor.photo_url) {
    return (
      <img
        src={tutor.photo_url}
        alt={tutor.display_name}
        className={`w-full ${cls} mx-auto rounded-2xl shadow-lg object-cover aspect-square`}
      />
    );
  }
  return (
    <div className={`w-full ${cls} mx-auto rounded-2xl bg-kotoba-primary/10 aspect-square flex items-center justify-center`}>
      <span className="text-6xl font-extrabold text-kotoba-primary/40">
        {tutor.display_name.charAt(0)}
      </span>
    </div>
  );
};

const CTAs = ({ ctaLabel, ctaAnchor, justify = 'start' }) => (
  <div className={`mt-8 flex flex-wrap gap-3 justify-${justify}`}>
    <a
      href={ctaAnchor}
      className="inline-flex items-center px-6 py-3 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
    >
      {ctaLabel}
    </a>
    <a
      href="#about"
      className="inline-flex items-center px-6 py-3 rounded-lg border-2 border-kotoba-primary text-kotoba-primary font-semibold hover:bg-kotoba-primary hover:text-white transition-colors"
    >
      More about me
    </a>
  </div>
);

const SubheadOrLanguages = ({ subhead, languages, center = false }) => {
  if (subhead) {
    return (
      <p className={`mt-3 text-lg text-kotoba-text/80 ${center ? 'text-center' : ''}`}>{subhead}</p>
    );
  }
  if (languages.length > 0) {
    return (
      <p className={`mt-3 text-lg text-kotoba-text/80 ${center ? 'text-center' : ''}`}>
        Teaches <span className="text-kotoba-primary font-medium">{languages.join(' · ')}</span>
      </p>
    );
  }
  return null;
};

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
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="flex justify-center mb-6">
          <Photo tutor={tutor} size="md" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-kotoba-primary leading-tight">
          {headline}
        </h1>
        <SubheadOrLanguages subhead={subhead} languages={languages} center />
        {bio && (
          <p className="mt-6 text-lg text-kotoba-text leading-relaxed whitespace-pre-line">
            {bio}
          </p>
        )}
        <CTAs ctaLabel={ctaLabel} ctaAnchor={ctaAnchor} justify="center" />
      </section>
    );
  }

  if (variant === 'minimal') {
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-5xl sm:text-6xl font-extrabold text-kotoba-primary leading-tight">
          {headline}
        </h1>
        <SubheadOrLanguages subhead={subhead} languages={languages} center />
        <CTAs ctaLabel={ctaLabel} ctaAnchor={ctaAnchor} justify="center" />
      </section>
    );
  }

  const photoOnLeft = variant === 'portrait_left';

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div className={photoOnLeft ? 'lg:order-2' : ''}>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-kotoba-primary leading-tight">
            {headline}
          </h1>
          <SubheadOrLanguages subhead={subhead} languages={languages} />
          {bio && (
            <p className="mt-6 text-lg text-kotoba-text leading-relaxed whitespace-pre-line">
              {bio}
            </p>
          )}
          <CTAs ctaLabel={ctaLabel} ctaAnchor={ctaAnchor} />
        </div>
        <div className={photoOnLeft ? '' : 'lg:order-2'}>
          <Photo tutor={tutor} />
        </div>
      </div>
    </section>
  );
};

export default HeroPortrait;
