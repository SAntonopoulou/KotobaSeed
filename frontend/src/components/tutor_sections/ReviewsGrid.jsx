import React from 'react';

const Stars = ({ rating }) => (
  <div className="text-kotoba-secondary-dark text-lg leading-none">
    {'★'.repeat(rating)}
    <span className="text-kotoba-text/20">{'★'.repeat(5 - rating)}</span>
  </div>
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
        className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8"
      >
        <h2 className="text-2xl font-bold text-kotoba-primary mb-6">{title}</h2>
        <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-3 -mx-2 px-2">
          {items.map((t) => (
            <figure
              key={t.id}
              className="flex-shrink-0 w-80 snap-center border border-kotoba-text/10 rounded-xl p-5 bg-kotoba-background/30"
            >
              <Stars rating={t.rating} />
              <blockquote className="mt-3 text-kotoba-text leading-relaxed whitespace-pre-line">
                "{t.body}"
              </blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold text-kotoba-primary">{t.student_name}</span>
                {t.location && (
                  <span className="text-kotoba-text/60"> · {t.location}</span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }

  if (variant === 'single_quote') {
    // Highlight the highest-rated, longest review. Falls back to first.
    const featured = [...items].sort(
      (a, b) => b.rating - a.rating || b.body.length - a.body.length
    )[0];
    return (
      <section
        id="testimonials"
        className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center"
      >
        <Stars rating={featured.rating} />
        <blockquote className="mt-4 text-2xl text-kotoba-text leading-relaxed font-light italic">
          "{featured.body}"
        </blockquote>
        <figcaption className="mt-6 text-sm">
          <span className="font-semibold text-kotoba-primary">— {featured.student_name}</span>
          {featured.location && (
            <span className="text-kotoba-text/60">, {featured.location}</span>
          )}
        </figcaption>
      </section>
    );
  }

  if (variant === 'wall') {
    return (
      <section
        id="testimonials"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8"
      >
        <h2 className="text-2xl font-bold text-kotoba-primary mb-6">{title}</h2>
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 space-y-5">
          {items.map((t) => (
            <figure
              key={t.id}
              className="break-inside-avoid border border-kotoba-text/10 rounded-xl p-5 bg-kotoba-background/30"
            >
              <Stars rating={t.rating} />
              <blockquote className="mt-3 text-kotoba-text leading-relaxed whitespace-pre-line">
                "{t.body}"
              </blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold text-kotoba-primary">{t.student_name}</span>
                {t.location && (
                  <span className="text-kotoba-text/60"> · {t.location}</span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }

  // grid (default)
  return (
    <section
      id="testimonials"
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8"
    >
      <h2 className="text-2xl font-bold text-kotoba-primary mb-6">{title}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((t) => (
          <figure
            key={t.id}
            className="border border-kotoba-text/10 rounded-xl p-5 flex flex-col bg-kotoba-background/30"
          >
            <Stars rating={t.rating} />
            <blockquote className="mt-3 text-kotoba-text leading-relaxed whitespace-pre-line">
              "{t.body}"
            </blockquote>
            <figcaption className="mt-4 text-sm">
              <span className="font-semibold text-kotoba-primary">{t.student_name}</span>
              {t.location && (
                <span className="text-kotoba-text/60"> · {t.location}</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
};

export default ReviewsGrid;
