import React from 'react';

// "Schedule a lesson" CTA block. Designed for schools that don't want
// the noisy pricing grid but still want an obvious booking entry
// point on the page. Pricing-grid handles the detailed listing; this
// is the simple "tell me when you're free" version, linking into the
// existing booking flow at /book.

const BookingCta = ({ content }) => {
  const eyebrow = content?.eyebrow?.trim() || 'Book a lesson';
  const title = content?.title?.trim() || 'Find a time that works for you.';
  const sub =
    content?.sub?.trim() ||
    "We'll match you with the right tutor and confirm within a day.";
  const ctaLabel = content?.cta_label?.trim() || 'See availability';
  const ctaHref = content?.cta_href?.trim() || '/book';
  const secondaryLabel = content?.secondary_label?.trim() || null;
  const secondaryHref = content?.secondary_href?.trim() || null;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="relative rounded-3xl overflow-hidden isolate p-8 sm:p-12 shadow-soft-lg">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-br from-kotoba-primary via-kotoba-primary to-kotoba-primary/85"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-90"
          style={{
            background:
              'radial-gradient(ellipse 55% 70% at 100% 0%, rgba(214,164,47,0.30), transparent 65%),' +
              'radial-gradient(ellipse 45% 50% at 0% 100%, rgba(255,255,255,0.10), transparent 70%)',
          }}
        />
        <div className="relative text-white">
          <p className="font-sans text-[11px] font-bold uppercase tracking-[0.22em] text-kotoba-secondary mb-3">
            {eyebrow}
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold leading-tight tracking-[-0.02em] max-w-2xl">
            {title}
          </h2>
          <p className="mt-3 text-base sm:text-lg text-white/85 leading-relaxed max-w-2xl">
            {sub}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href={ctaHref}
              className="group inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
            >
              {ctaLabel}
              <span
                aria-hidden
                className="ml-2 transition-transform duration-300 group-hover:translate-x-0.5"
              >
                →
              </span>
            </a>
            {secondaryLabel && secondaryHref && (
              <a
                href={secondaryHref}
                className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-white/10 backdrop-blur-sm text-white font-medium border border-white/25 hover:bg-white/15 transition-colors"
              >
                {secondaryLabel}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default BookingCta;
