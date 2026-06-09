import React from 'react';

const formatPrice = (cents, currency = 'eur') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'eur').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
};

// Modernised pricing grid — magazine-card layout, gradient trial banner,
// honey-shadow primary CTAs. Reads as "choose your way in" rather than
// a product matrix.

const PackCard = ({ pack, onBook, ctaLabel = 'Book', subtitleSuffix }) => (
  <div className="group relative bg-white rounded-3xl p-6 shadow-soft hover:shadow-soft-lg hover:-translate-y-1 transition-all duration-500 ease-soft flex flex-col">
    <div className="flex items-start justify-between gap-3">
      <h4 className="font-display text-lg font-bold text-kotoba-primary leading-tight">
        {pack.name}
      </h4>
      <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/50 whitespace-nowrap">
        {pack.duration_minutes} min
        {subtitleSuffix ? ` · ${subtitleSuffix}` : ''}
      </span>
    </div>
    {pack.description && (
      <p className="mt-3 text-sm text-kotoba-text/75 whitespace-pre-line leading-relaxed">
        {pack.description}
      </p>
    )}
    <div className="mt-auto pt-5">
      <p className="font-display text-3xl font-bold text-kotoba-primary tabular-nums tracking-[-0.01em]">
        {formatPrice(pack.price_cents, pack.currency)}
      </p>
      <button
        type="button"
        onClick={() => onBook(pack)}
        className="group/btn mt-4 w-full inline-flex items-center justify-center px-5 py-2.5 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
      >
        {ctaLabel}
        <span
          className="ml-1.5 transition-transform duration-300 group-hover/btn:translate-x-1"
          aria-hidden="true"
        >
          →
        </span>
      </button>
    </div>
  </div>
);

const PricingGrid = ({ tutor, packs, trial, isOwner, content, onBookPack, onBookTrial }) => {
  const title = content?.title?.trim() || 'Book a lesson';
  const singleLessons = (packs || []).filter((p) => p.num_lessons === 1);
  const multiPacks = (packs || []).filter((p) => p.num_lessons > 1);
  const trialOffered = trial?.offers_free_trial;
  const allEmpty = !trialOffered && singleLessons.length === 0 && multiPacks.length === 0;

  return (
    <section
      id="book"
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20"
    >
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
          Lessons
        </p>
        <h2 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
          {title}
        </h2>
      </div>

      <div className="mt-12 space-y-10">
        {trialOffered && (
          <div className="relative rounded-3xl bg-kotoba-primary text-white shadow-soft-lg overflow-hidden isolate">
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10"
              style={{
                background:
                  'radial-gradient(ellipse 50% 70% at 100% 0%, rgba(214,164,47,0.30), transparent 60%),' +
                  'radial-gradient(ellipse 40% 40% at 0% 100%, rgba(255,255,255,0.06), transparent 70%)',
              }}
            />
            <div className="v2-noise" />
            <div className="relative p-7 sm:p-9 flex items-start justify-between gap-5 flex-wrap">
              <div className="max-w-xl">
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary">
                  Start here
                </p>
                <h3 className="mt-2 font-display text-2xl sm:text-3xl font-bold leading-tight">
                  Try a free {trial.free_trial_minutes}-minute lesson
                </h3>
                <p className="mt-3 text-sm sm:text-base text-white/85 leading-relaxed">
                  A short intro on us — no card needed. See if you click with{' '}
                  {tutor.display_name} before committing to anything.
                </p>
              </div>
              <button
                type="button"
                onClick={onBookTrial}
                className="group inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft whitespace-nowrap"
              >
                Book a free trial
                <span
                  className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  →
                </span>
              </button>
            </div>
          </div>
        )}

        {singleLessons.length === 1 && (
          <div className="rounded-3xl bg-white shadow-soft p-7 flex flex-wrap items-center justify-between gap-5">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                Single lesson
              </p>
              <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                <span className="font-display text-3xl sm:text-4xl font-bold text-kotoba-primary tabular-nums tracking-[-0.01em]">
                  {formatPrice(singleLessons[0].price_cents, singleLessons[0].currency)}
                </span>
                <span className="text-sm text-kotoba-text/65">
                  · {singleLessons[0].duration_minutes} min
                </span>
              </div>
              {singleLessons[0].description && (
                <p className="mt-2 text-sm text-kotoba-text/75 whitespace-pre-line leading-relaxed max-w-xl">
                  {singleLessons[0].description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onBookPack(singleLessons[0])}
              className="group inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft whitespace-nowrap"
            >
              Book a lesson
              <span
                className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              >
                →
              </span>
            </button>
          </div>
        )}

        {singleLessons.length > 1 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark mb-4">
              Single lessons
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {singleLessons.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  onBook={onBookPack}
                  ctaLabel="Book"
                />
              ))}
            </div>
          </div>
        )}

        {multiPacks.length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark mb-2">
              Lesson packs
            </h3>
            <p className="text-sm text-kotoba-text/70 mb-4 max-w-xl">
              Bundles of lessons at a better price. You schedule each one as you go.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {multiPacks.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  onBook={onBookPack}
                  ctaLabel="Book this pack"
                  subtitleSuffix={`${pack.num_lessons} lessons`}
                />
              ))}
            </div>
          </div>
        )}

        {allEmpty && (
          <div className="rounded-3xl bg-white shadow-soft p-8 text-center">
            <p className="text-kotoba-text/70">
              {isOwner
                ? 'No lessons listed yet — add a lesson pack or enable the free trial from your dashboard.'
                : "This tutor hasn't listed lessons yet. Check back soon."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default PricingGrid;
