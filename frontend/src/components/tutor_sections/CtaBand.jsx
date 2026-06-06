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
        <div className="rounded-2xl border-2 border-kotoba-primary bg-white p-10 text-center">
          <h2 className="text-2xl font-bold text-kotoba-primary">{headline}</h2>
          {subhead && (
            <p className="mt-3 text-kotoba-text/80 leading-relaxed whitespace-pre-line">
              {subhead}
            </p>
          )}
          <a
            href={ctaAnchor}
            className="mt-6 inline-block px-6 py-3 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
          >
            {ctaLabel}
          </a>
        </div>
      </section>
    );
  }

  if (variant === 'split') {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 mx-4 sm:mx-auto mb-8">
        <div className="rounded-2xl bg-white shadow-sm p-8 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex-grow">
            <h2 className="text-2xl font-bold text-kotoba-primary">{headline}</h2>
            {subhead && (
              <p className="mt-2 text-kotoba-text/80 whitespace-pre-line">{subhead}</p>
            )}
          </div>
          <a
            href={ctaAnchor}
            className="px-6 py-3 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 whitespace-nowrap"
          >
            {ctaLabel}
          </a>
        </div>
      </section>
    );
  }

  // band (default — gradient full-width)
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 mx-4 sm:mx-auto mb-8">
      <div className="rounded-2xl bg-gradient-to-r from-kotoba-primary to-kotoba-primary/70 text-white p-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">{headline}</h2>
          {subhead && (
            <p className="mt-2 text-white/90 whitespace-pre-line">{subhead}</p>
          )}
        </div>
        <a
          href={ctaAnchor}
          className="px-6 py-3 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark whitespace-nowrap"
        >
          {ctaLabel}
        </a>
      </div>
    </section>
  );
};

export default CtaBand;
