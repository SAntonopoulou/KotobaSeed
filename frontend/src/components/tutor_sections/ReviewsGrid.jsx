import React from 'react';

const Stars = ({ rating }) => (
  <div className="text-kotoba-secondary-dark text-lg leading-none tracking-wide">
    {'★'.repeat(rating)}
    <span className="text-kotoba-text/15">{'★'.repeat(5 - rating)}</span>
  </div>
);

const SectionEyebrow = ({ children, center = false }) => (
  <p
    className={
      'text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark ' +
      (center ? 'text-center' : '')
    }
  >
    {children}
  </p>
);

const ReviewCard = ({ t, className = '' }) => (
  <figure
    className={
      'rounded-3xl p-6 bg-white border border-kotoba-text/[0.06] shadow-soft hover:-translate-y-1 hover:shadow-soft-lg transition-all duration-500 ease-soft ' +
      className
    }
  >
    <Stars rating={t.rating} />
    <blockquote className="mt-4 text-kotoba-text/85 leading-relaxed whitespace-pre-line">
      <span aria-hidden="true" className="text-kotoba-secondary-dark font-display text-xl mr-0.5">“</span>
      {t.body}
      <span aria-hidden="true" className="text-kotoba-secondary-dark font-display text-xl ml-0.5">”</span>
    </blockquote>
    <figcaption className="mt-5 text-sm">
      <span className="font-display font-bold text-kotoba-primary">{t.student_name}</span>
      {t.location && (
        <span className="text-kotoba-text/55"> · {t.location}</span>
      )}
    </figcaption>
  </figure>
);

const ReviewsGrid = ({ testimonials, content }) => {
  const variant = content?.variant || 'grid';
  const title = content?.title?.trim() || 'What students say';
  const limit = Number.isFinite(content?.limit) && content.limit > 0 ? content.limit : null;
  const items = (testimonials || []).slice(0, limit || undefined);
  if (items.length === 0) return null;

  if (variant === 'carousel') {
    return (
      <section
        id="testimonials"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16"
      >
        <div className="text-center mb-10">
          <SectionEyebrow center>Reviews</SectionEyebrow>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
            {title}
          </h2>
        </div>
        <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4">
          {items.map((t) => (
            <div key={t.id} className="flex-shrink-0 w-80 snap-center">
              <ReviewCard t={t} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (variant === 'single_quote') {
    const featured = [...items].sort(
      (a, b) => b.rating - a.rating || b.body.length - a.body.length
    )[0];
    return (
      <section
        id="testimonials"
        className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center"
      >
        <Stars rating={featured.rating} />
        <blockquote className="mt-5 font-display text-2xl sm:text-3xl text-kotoba-text leading-relaxed italic">
          <span aria-hidden="true" className="text-kotoba-secondary-dark">“</span>
          {featured.body}
          <span aria-hidden="true" className="text-kotoba-secondary-dark">”</span>
        </blockquote>
        <figcaption className="mt-7 text-sm">
          <span className="font-display font-bold text-kotoba-primary">— {featured.student_name}</span>
          {featured.location && (
            <span className="text-kotoba-text/55">, {featured.location}</span>
          )}
        </figcaption>
      </section>
    );
  }

  if (variant === 'wall') {
    return (
      <section
        id="testimonials"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16"
      >
        <SectionEyebrow>Reviews</SectionEyebrow>
        <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em] mb-10">
          {title}
        </h2>
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 space-y-5">
          {items.map((t) => (
            <ReviewCard key={t.id} t={t} className="break-inside-avoid" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      id="testimonials"
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16"
    >
      <SectionEyebrow>Reviews</SectionEyebrow>
      <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em] mb-10">
        {title}
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((t) => (
          <ReviewCard key={t.id} t={t} />
        ))}
      </div>
    </section>
  );
};

export default ReviewsGrid;
