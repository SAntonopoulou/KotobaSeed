import React, { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';

// Curated module bundle showcase. Each section content carries an
// ordered list of LessonModule slugs the school owner has chosen to
// promote. We hydrate them against the public modules endpoint at
// render time so the cards always show live pricing, lesson counts,
// and titles — content updates flow through automatically without
// the school owner re-editing the section.

const ProgramsShowcase = ({ content }) => {
  const slugs = useMemo(
    () => (Array.isArray(content?.module_slugs) ? content.module_slugs : []),
    [content?.module_slugs],
  );
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slugs.length === 0) {
      setModules([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/modules');
        const all = Array.isArray(res.data) ? res.data : [];
        const bySlug = new Map(all.map((m) => [m.slug, m]));
        // Preserve the curator's order — Map iteration stays insertion-ordered
        // by slug param, not by API order.
        const ordered = slugs
          .map((s) => bySlug.get(s))
          .filter(Boolean);
        if (!cancelled) setModules(ordered);
      } catch {
        if (!cancelled) setModules([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slugs]);

  if (loading) return null;
  if (modules.length === 0) return null;

  const eyebrow = content?.eyebrow?.trim() || 'Programs';
  const title = content?.title?.trim() || 'Programs we run';
  const sub = content?.sub?.trim() || null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <p className="font-sans text-[11px] font-bold uppercase tracking-[0.22em] text-kotoba-primary mb-3">
          {eyebrow}
        </p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-kotoba-text leading-tight tracking-[-0.02em]">
          {title}
        </h2>
        {sub && (
          <p className="mt-3 text-base text-kotoba-text/70 leading-relaxed">
            {sub}
          </p>
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <ProgramCard key={m.slug} module={m} />
        ))}
      </div>
    </section>
  );
};

const ProgramCard = ({ module }) => {
  const priceLabel =
    module.price_cents > 0
      ? formatPrice(module.price_cents, module.currency || 'EUR')
      : 'Free';
  const lessonCount = module.lesson_count ?? module.num_lessons ?? null;
  return (
    <a
      href={`/modules/${module.slug}`}
      className="group block bg-white rounded-3xl p-6 shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-200 ease-soft"
    >
      {module.cover_url && (
        <div className="aspect-video rounded-2xl overflow-hidden mb-4 bg-kotoba-background/30">
          <img
            src={module.cover_url}
            alt={module.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-kotoba-text mb-2 leading-snug">
        {module.title}
      </h3>
      {module.short_description && (
        <p className="text-sm text-kotoba-text/70 leading-relaxed mb-4 line-clamp-3">
          {module.short_description}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-kotoba-text/[0.06]">
        <span className="text-base font-semibold text-kotoba-primary">
          {priceLabel}
        </span>
        {lessonCount != null && (
          <span className="text-xs text-kotoba-text/55 font-medium">
            {lessonCount} lesson{lessonCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </a>
  );
};

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£' };
const formatPrice = (cents, currency) => {
  const symbol = CURRENCY_SYMBOL[String(currency || 'EUR').toUpperCase()] || '';
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return `${symbol}${text}`;
};

export default ProgramsShowcase;
