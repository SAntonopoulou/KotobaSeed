import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { apexUrl } from '../hooks/useTenant';

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

// Public list of published modules on a tutor's subdomain.

const ModulesStorefront = () => {
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
        setError(err?.response?.data?.detail || 'Could not load this page.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="bg-kotoba-background min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href={apexUrl('/')} className="text-xs uppercase tracking-wider text-kotoba-text/50 hover:text-kotoba-primary">
              Kotobaseed
            </a>
            <span className="text-kotoba-text/30">·</span>
            <Link to="/" className="text-xl font-semibold text-kotoba-primary hover:underline">
              {tutor?.display_name || 'Tutor'}
            </Link>
          </div>
          <Link to="/" className="text-sm text-kotoba-text/70 hover:text-kotoba-primary">
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <header>
          <h1 className="text-4xl font-extrabold text-kotoba-primary">Self-paced modules</h1>
          <p className="mt-2 text-lg text-kotoba-text/80">
            Buy a curriculum bundle and learn at your own pace. One-time purchase, permanent access.
          </p>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-kotoba-text">Loading…</p>
        ) : modules.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-kotoba-text/70">No modules published yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((m) => (
              <Link
                key={m.id}
                to={`/modules/${m.slug}`}
                className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden no-underline"
              >
                {m.featured_image_url ? (
                  <img src={m.featured_image_url} alt={m.title} className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-kotoba-primary/10 flex items-center justify-center">
                    <span className="text-5xl font-bold text-kotoba-primary/40">{m.title[0]}</span>
                  </div>
                )}
                <div className="p-5">
                  <h3 className="text-lg font-bold text-kotoba-primary">{m.title}</h3>
                  {m.summary && (
                    <p className="mt-2 text-sm text-kotoba-text/80 line-clamp-2">{m.summary}</p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-2xl font-extrabold text-kotoba-primary">
                      {formatPrice(m.price_cents, m.currency)}
                    </span>
                    <span className="text-xs text-kotoba-text/60">
                      {m.item_count} {m.item_count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ModulesStorefront;
