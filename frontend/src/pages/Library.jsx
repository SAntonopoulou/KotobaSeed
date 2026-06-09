import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

// Apex marketplace directory — students discover tutors across the whole
// platform. Lives at /library on the apex; each card links out to the
// tutor's own site (subdomain or custom domain).

const formatPrice = (cents, currency) => {
  if (cents == null) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'eur').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
};

const parseLanguages = (raw) => {
  if (!raw) return [];
  return raw
    .replace(/;|\|/g, ',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const Library = () => {
  const [tutors, setTutors] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [language, setLanguage] = useState('');
  const [maxPriceEuros, setMaxPriceEuros] = useState('');
  const [trialOnly, setTrialOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (language) params.set('language', language);
      const cents = parseInt(maxPriceEuros, 10);
      if (Number.isFinite(cents) && cents > 0) {
        params.set('max_price_cents', String(cents * 100));
      }
      if (trialOnly) params.set('trial_only', 'true');
      const path = '/marketplace/tutors' + (params.toString() ? `?${params}` : '');
      const res = await client.get(path);
      setTutors(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the directory.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/marketplace/languages');
        setLanguages(res.data || []);
      } catch {
        // Filter dropdown is non-critical — silent fallback.
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [language, trialOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Price is debounced — only refetches when the user blurs the field.
  const handlePriceBlur = () => {
    load();
  };
  const handleFiltersReset = () => {
    setLanguage('');
    setMaxPriceEuros('');
    setTrialOnly(false);
  };

  const empty = !loading && tutors.length === 0 && !error;

  const hasAnyFilter = useMemo(
    () => Boolean(language || maxPriceEuros || trialOnly),
    [language, maxPriceEuros, trialOnly]
  );

  return (
    <div className="bg-kotoba-background min-h-screen">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-kotoba-primary">
            Find a tutor
          </h1>
          <p className="mt-3 text-lg text-kotoba-text/80 max-w-2xl">
            Browse independent language tutors building their practice on Kotobaseed. Click any tutor to visit their site, see their schedule, and book directly with them.
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-8 grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1" htmlFor="filter-language">
              Language
            </label>
            <select
              id="filter-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            >
              <option value="">Any language</option>
              {languages.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1" htmlFor="filter-price">
              Max single-lesson price (€)
            </label>
            <input
              id="filter-price"
              type="number"
              min={0}
              max={1000}
              value={maxPriceEuros}
              onChange={(e) => setMaxPriceEuros(e.target.value)}
              onBlur={handlePriceBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePriceBlur(); }}
              placeholder="e.g. 30"
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-kotoba-text">
            <input
              type="checkbox"
              checked={trialOnly}
              onChange={(e) => setTrialOnly(e.target.checked)}
              className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
            />
            Free trial only
          </label>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={handleFiltersReset}
              className="text-sm text-kotoba-text/70 hover:text-kotoba-text underline justify-self-start"
            >
              Reset filters
            </button>
          )}
        </div>

        {loading && (
          <p className="text-kotoba-text">Loading tutors…</p>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {empty && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <h2 className="text-xl font-bold text-kotoba-primary mb-2">
              No tutors match those filters
            </h2>
            <p className="text-kotoba-text/70">
              Try widening your search, or <button onClick={handleFiltersReset} className="text-kotoba-primary underline">reset the filters</button>.
            </p>
          </div>
        )}

        {!loading && tutors.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tutors.map((t) => {
              const langs = parseLanguages(t.languages_taught);
              const price = formatPrice(t.single_lesson_price_cents, t.single_lesson_currency);
              return (
                <a
                  key={t.tutor_slug}
                  href={t.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col text-left no-underline"
                >
                  <div className="flex items-start gap-4">
                    {t.photo_url ? (
                      <img
                        src={t.photo_url}
                        alt={t.display_name}
                        className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-kotoba-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl font-bold text-kotoba-primary/60">
                          {t.display_name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="flex-grow min-w-0">
                      <h3 className="text-lg font-bold text-kotoba-primary truncate">
                        {t.display_name}
                      </h3>
                      {langs.length > 0 && (
                        <p className="text-sm text-kotoba-text/70 truncate">
                          {langs.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {t.bio && (
                    <p className="mt-3 text-sm text-kotoba-text/80 line-clamp-3 whitespace-pre-line">
                      {t.bio}
                    </p>
                  )}

                  <div className="flex-grow" />

                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    {price && (
                      <span className="px-2 py-1 rounded-md bg-kotoba-primary/10 text-kotoba-primary text-xs font-medium">
                        {price} · {t.single_lesson_duration_minutes} min
                      </span>
                    )}
                    {t.offers_free_trial && (
                      <span className="px-2 py-1 rounded-md bg-kotoba-secondary/30 text-kotoba-text text-xs font-medium">
                        Free {t.free_trial_minutes}-min trial
                      </span>
                    )}
                  </div>

                  <div className="mt-4 text-sm font-medium text-kotoba-primary">
                    Visit site →
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default Library;
