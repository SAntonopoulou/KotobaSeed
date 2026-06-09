import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useReveal } from '../hooks/landingAnimations';
import { apexUrl } from '../hooks/useTenant';
import { getErrorMessage } from '../utils/errors';

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

const RevealBlock = ({ children, delay = 0 }) => {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={`v2-reveal ${visible ? 'is-revealed' : ''}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
};

// Public list of published modules. Per-tutor subscription banner was
// removed in the 2026-06-07 sweep — Plus is now the only subscription
// concept and lives on the apex / article preview gate, not here.

const ModulesStorefront = () => {
  const [params] = useSearchParams();
  const justSubscribed = params.get('subscribed') === '1';
  const [tutor, setTutor] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [tRes, mRes] = await Promise.all([
          client.get('/tutor/me'),
          client.get('/modules'),
        ]);
        setTutor(tRes.data || null);
        setModules(mRes.data || []);
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load this page.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-kotoba-text/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href={apexUrl('/')}
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-kotoba-text/50 hover:text-kotoba-primary transition-colors"
            >
              Kotobaseed
            </a>
            <span className="text-kotoba-text/20">/</span>
            <Link
              to="/"
              className="font-display text-lg font-bold text-kotoba-primary hover:underline truncate"
            >
              {tutor?.display_name || 'Tutor'}
            </Link>
          </div>
          <Link
            to="/"
            className="text-sm text-kotoba-text/70 hover:text-kotoba-primary inline-flex items-center gap-1.5"
          >
            <span aria-hidden="true">←</span> Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-8">
        {justSubscribed && (
          <div className="bg-kotoba-secondary/30 border border-kotoba-secondary text-kotoba-text px-5 py-4 rounded-2xl text-sm font-medium">
            Subscription active — every module + premium homework is yours now.
          </div>
        )}

        <RevealBlock>
          <header>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              Self-paced
            </p>
            <h1 className="mt-2 font-display text-5xl sm:text-6xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
              Modules
            </h1>
            <p className="mt-4 text-lg text-kotoba-text/75 leading-relaxed max-w-2xl">
              Curriculum bundles you work through at your own pace. One-time purchase,{' '}
              <span className="font-display italic text-kotoba-primary">permanent access.</span>
            </p>
          </header>
        </RevealBlock>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-kotoba-text/60">Loading…</p>
        ) : modules.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-soft p-10 text-center">
            <p className="text-kotoba-text/70">No modules published yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {modules.map((m, i) => (
              <RevealBlock key={m.id} delay={i * 60}>
                <Link
                  to={`/modules/${m.slug}`}
                  className="group block bg-white rounded-3xl shadow-soft hover:shadow-soft-lg hover:-translate-y-1 transition-all duration-500 ease-soft overflow-hidden no-underline h-full"
                >
                  {m.featured_image_url ? (
                    <img
                      src={m.featured_image_url}
                      alt={m.title}
                      className="w-full h-44 object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-44 flex items-center justify-center"
                      style={{
                        background:
                          'radial-gradient(ellipse 60% 70% at 30% 30%, rgb(var(--kotoba-secondary-rgb) / 0.35), transparent 70%),' +
                          'rgb(var(--kotoba-primary-rgb) / 0.08)',
                      }}
                    >
                      <span className="font-display text-6xl font-bold text-kotoba-primary/40">
                        {m.title[0]}
                      </span>
                    </div>
                  )}
                  <div className="p-6">
                    <h3 className="font-display text-xl font-bold text-kotoba-primary leading-tight">
                      {m.title}
                    </h3>
                    {m.summary && (
                      <p className="mt-2 text-sm text-kotoba-text/75 leading-relaxed line-clamp-2">
                        {m.summary}
                      </p>
                    )}
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <span className="font-display text-2xl font-bold text-kotoba-primary tabular-nums tracking-[-0.01em]">
                        {formatPrice(m.price_cents, m.currency)}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-text/55">
                        {m.item_count} {m.item_count === 1 ? 'item' : 'items'}
                        {m.preview_item_count > 0 && (
                          <span className="text-kotoba-primary"> · {m.preview_item_count} free</span>
                        )}
                      </span>
                    </div>
                  </div>
                </Link>
              </RevealBlock>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ModulesStorefront;
