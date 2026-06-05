import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
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

// Public list of published modules + optional subscription banner.

const ModulesStorefront = () => {
  const { token } = useAuth();
  const [params] = useSearchParams();
  const justSubscribed = params.get('subscribed') === '1';
  const [tutor, setTutor] = useState(null);
  const [modules, setModules] = useState([]);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [tRes, mRes, pRes] = await Promise.all([
          client.get('/tutor/me'),
          client.get('/modules'),
          client.get('/tutor/subscription-plan/public').catch(() => ({ data: null })),
        ]);
        setTutor(tRes.data || null);
        setModules(mRes.data || []);
        setPlan(pRes.data || null);
      } catch (err) {
        setError(err?.response?.data?.detail || 'Could not load this page.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const subscribe = async () => {
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
      return;
    }
    setSubscribing(true);
    setError('');
    try {
      const res = await client.post('/tutor/subscription-plan/subscribe');
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setError('Could not start checkout.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not start subscription.');
    } finally {
      setSubscribing(false);
    }
  };

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
        {justSubscribed && (
          <div className="bg-kotoba-primary/10 border border-kotoba-primary/30 text-kotoba-primary px-4 py-3 rounded-md text-sm">
            Subscription active — every module + premium homework is yours now.
          </div>
        )}

        <header>
          <h1 className="text-4xl font-extrabold text-kotoba-primary">Self-paced modules</h1>
          <p className="mt-2 text-lg text-kotoba-text/80">
            Buy a curriculum bundle and learn at your own pace. One-time purchase, permanent access.
          </p>
        </header>

        {plan?.is_available && (
          <section className="bg-gradient-to-r from-kotoba-primary to-green-700 text-white rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm uppercase tracking-wider opacity-80">Subscribe + save</p>
              <h2 className="mt-1 text-2xl font-bold">
                Every module + premium drill for {formatPrice(plan.price_cents, plan.currency)}/mo
              </h2>
              <p className="mt-2 text-sm opacity-90 max-w-xl">
                Permanent buy gives you forever access to one module. Subscribing gives you everything {tutor?.display_name || 'this tutor'} publishes — for as long as you stay subscribed.
              </p>
            </div>
            <button
              type="button"
              onClick={subscribe}
              disabled={subscribing}
              className="px-6 py-3 rounded-lg bg-kotoba-secondary text-kotoba-text font-bold hover:bg-kotoba-secondary-dark disabled:opacity-60 whitespace-nowrap"
            >
              {subscribing ? 'Loading…' : token ? 'Subscribe' : 'Sign in & subscribe'}
            </button>
          </section>
        )}

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
