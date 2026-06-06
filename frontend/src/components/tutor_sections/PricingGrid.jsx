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

const PricingGrid = ({ tutor, packs, trial, isOwner, content, onBookPack, onBookTrial }) => {
  const title = content?.title?.trim() || 'Book a lesson';
  const singleLessons = (packs || []).filter((p) => p.num_lessons === 1);
  const multiPacks = (packs || []).filter((p) => p.num_lessons > 1);
  const trialOffered = trial?.offers_free_trial;
  const allEmpty = !trialOffered && singleLessons.length === 0 && multiPacks.length === 0;

  return (
    <section
      id="book"
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-16 space-y-10"
    >
      <div>
        <h2 className="text-2xl font-bold text-kotoba-primary mb-3">{title}</h2>
      </div>

      {trialOffered && (
        <div className="rounded-xl bg-gradient-to-r from-kotoba-primary to-green-700 text-white p-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="max-w-xl">
            <h3 className="text-lg font-bold">
              Try a free {trial.free_trial_minutes}-minute lesson
            </h3>
            <p className="text-sm opacity-90 mt-1">
              A short intro lesson on us — no card needed. See if you click with{' '}
              {tutor.display_name} before committing to anything.
            </p>
          </div>
          <button
            type="button"
            onClick={onBookTrial}
            className="px-5 py-2.5 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark whitespace-nowrap"
          >
            Book a free trial →
          </button>
        </div>
      )}

      {singleLessons.length === 1 && (
        <div className="border-y border-kotoba-text/10 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-kotoba-text/60">
              Single lesson
            </p>
            <p className="mt-1 text-kotoba-text">
              <span className="text-2xl font-extrabold text-kotoba-primary">
                {formatPrice(singleLessons[0].price_cents, singleLessons[0].currency)}
              </span>
              <span className="ml-2 text-sm text-kotoba-text/70">
                · {singleLessons[0].duration_minutes} min
              </span>
            </p>
            {singleLessons[0].description && (
              <p className="mt-1 text-sm text-kotoba-text/70 whitespace-pre-line">
                {singleLessons[0].description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onBookPack(singleLessons[0])}
            className="px-5 py-2.5 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark whitespace-nowrap"
          >
            Book a lesson
          </button>
        </div>
      )}

      {singleLessons.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-kotoba-text/60 mb-3">
            Single lessons
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {singleLessons.map((pack) => (
              <div
                key={pack.id}
                className="border border-kotoba-text/10 rounded-xl p-5 flex flex-col bg-kotoba-background/40"
              >
                <h4 className="text-lg font-semibold text-kotoba-primary">{pack.name}</h4>
                <p className="mt-1 text-sm text-kotoba-text/70">
                  {pack.duration_minutes} min
                </p>
                {pack.description && (
                  <p className="mt-3 text-sm text-kotoba-text whitespace-pre-line">
                    {pack.description}
                  </p>
                )}
                <div className="flex-grow" />
                <p className="mt-4 text-2xl font-extrabold text-kotoba-primary">
                  {formatPrice(pack.price_cents, pack.currency)}
                </p>
                <button
                  type="button"
                  onClick={() => onBookPack(pack)}
                  className="mt-4 w-full px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
                >
                  Book this lesson
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {multiPacks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-kotoba-text/60 mb-3">
            Lesson packs
          </h3>
          <p className="text-sm text-kotoba-text/70 mb-4">
            Bundles of lessons at a better price. You schedule each one as you go.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {multiPacks.map((pack) => (
              <div
                key={pack.id}
                className="border border-kotoba-text/10 rounded-xl p-5 flex flex-col bg-kotoba-background/40"
              >
                <h4 className="text-lg font-semibold text-kotoba-primary">{pack.name}</h4>
                <p className="mt-1 text-sm text-kotoba-text/70">
                  {pack.num_lessons} × {pack.duration_minutes} min
                </p>
                {pack.description && (
                  <p className="mt-3 text-sm text-kotoba-text whitespace-pre-line">
                    {pack.description}
                  </p>
                )}
                <div className="flex-grow" />
                <p className="mt-4 text-2xl font-extrabold text-kotoba-primary">
                  {formatPrice(pack.price_cents, pack.currency)}
                </p>
                <button
                  type="button"
                  onClick={() => onBookPack(pack)}
                  className="mt-4 w-full px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
                >
                  Book this pack
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {allEmpty && (
        <p className="text-kotoba-text">
          {isOwner
            ? 'No lessons listed yet — add a lesson pack or enable the free trial from your dashboard.'
            : "This tutor hasn't listed lessons yet. Check back soon."}
        </p>
      )}
    </section>
  );
};

export default PricingGrid;
