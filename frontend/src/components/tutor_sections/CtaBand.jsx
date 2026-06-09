import React from 'react';

const CtaBand = ({ content }) => {
  const variant = content?.variant || 'band';
  const headline = content?.headline?.trim() || 'Ready to start?';
  const subhead = content?.subhead?.trim() || null;
  const ctaLabel = content?.cta_label?.trim() || 'Book a lesson';
  const ctaAnchor = content?.cta_anchor?.trim() || '#book';

  if (variant === 'centered_box') {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-3xl border border-kotoba-primary/20 bg-gradient-to-br from-white via-white to-kotoba-secondary/15 p-10 sm:p-12 text-center shadow-soft">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
            {headline}
          </h2>
          {subhead && (
            <p className="mt-4 text-lg text-kotoba-text/75 leading-relaxed whitespace-pre-line max-w-xl mx-auto">
              {subhead}
            </p>
          )}
          <a
            href={ctaAnchor}
            className="group mt-7 inline-flex items-center justify-center px-7 py-3.5 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft-lg hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
          >
            {ctaLabel}
            <span
              className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            >
              →
            </span>
          </a>
        </div>
      </section>
    );
  }

  if (variant === 'split') {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="rounded-3xl bg-white shadow-soft p-8 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex-grow">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
              {headline}
            </h2>
            {subhead && (
              <p className="mt-2 text-base text-kotoba-text/75 whitespace-pre-line leading-relaxed">
                {subhead}
              </p>
            )}
          </div>
          <a
            href={ctaAnchor}
            className="group inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft whitespace-nowrap"
          >
            {ctaLabel}
            <span
              className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            >
              →
            </span>
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="relative rounded-3xl bg-kotoba-primary text-white p-8 sm:p-10 shadow-soft-lg overflow-hidden isolate flex items-center justify-between gap-5 flex-wrap">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 50% 70% at 100% 0%, rgba(214,164,47,0.25), transparent 60%),' +
              'radial-gradient(ellipse 40% 40% at 0% 100%, rgba(255,255,255,0.06), transparent 70%)',
          }}
        />
        <div className="v2-noise" />
        <div className="relative max-w-xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight tracking-[-0.015em]">
            {headline}
          </h2>
          {subhead && (
            <p className="mt-2 text-base text-white/85 whitespace-pre-line leading-relaxed">
              {subhead}
            </p>
          )}
        </div>
        <a
          href={ctaAnchor}
          className="relative group inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft whitespace-nowrap"
        >
          {ctaLabel}
          <span
            className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden="true"
          >
            →
          </span>
        </a>
      </div>
    </section>
  );
};

export default CtaBand;
