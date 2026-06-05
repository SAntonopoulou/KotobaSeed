import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

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

// Module detail + checkout. Content is gated behind the purchase: pre-
// purchase we show description + item count; post-purchase we show
// linkable items. Anonymous visitors get a sign-in prompt at checkout.

const ModuleDetail = () => {
  const { slug } = useParams();
  const { token } = useAuth();
  const [params] = useSearchParams();
  const justPaid = params.get('paid') === '1';
  const [module, setModule] = useState(null);
  const [tutor, setTutor] = useState(null);
  const [articles, setArticles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [mRes, tRes] = await Promise.all([
          client.get(`/modules/${slug}`),
          client.get('/tutor/me'),
        ]);
        setModule(mRes.data);
        setTutor(tRes.data || null);
        // Resolve item titles when purchased — articles list is public,
        // homework list is owner-only (so for the student we just show
        // "Homework: <name>" without title lookup — they can hit the link).
        if (mRes.data?.purchased) {
          try {
            const arts = await client.get('/articles');
            setArticles(arts.data || []);
          } catch { /* ignore */ }
        }
      } catch (err) {
        setError(err?.response?.data?.detail || 'Module not found.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const buy = async () => {
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
      return;
    }
    setBuying(true);
    setError('');
    try {
      const res = await client.post(`/tutor/modules/${module.id}/checkout`);
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setError('Could not start checkout.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Checkout failed.');
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-kotoba-background"><p>Loading…</p></div>;
  }
  if (error && !module) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kotoba-background p-4">
        <div className="bg-white rounded-2xl shadow p-6 max-w-md text-center">
          <h1 className="text-xl font-bold text-kotoba-primary mb-2">Hmm</h1>
          <p className="text-kotoba-text">{error}</p>
          <Link to="/modules" className="mt-4 inline-block text-kotoba-primary hover:underline">← All modules</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-kotoba-background min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/modules" className="text-sm text-kotoba-text/70 hover:text-kotoba-primary">
            ← All modules
          </Link>
          <span className="text-sm text-kotoba-text/60">{tutor?.display_name}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        {justPaid && (
          <div className="bg-kotoba-primary/10 border border-kotoba-primary/30 text-kotoba-primary px-4 py-3 rounded-md text-sm">
            Payment received — your access is unlocked below. Welcome!
          </div>
        )}

        {module.featured_image_url && (
          <img src={module.featured_image_url} alt={module.title} className="w-full rounded-2xl object-cover max-h-72" />
        )}

        <header>
          <h1 className="text-4xl font-extrabold text-kotoba-primary">{module.title}</h1>
          {module.summary && <p className="mt-2 text-lg text-kotoba-text/80">{module.summary}</p>}
        </header>

        {module.description && (
          <p className="text-kotoba-text whitespace-pre-line bg-white rounded-2xl shadow-sm p-6">
            {module.description}
          </p>
        )}

        {module.purchased ? (
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-kotoba-primary mb-3">Your content</h2>
            {module.items.length === 0 ? (
              <p className="text-sm text-kotoba-text/70">
                The tutor hasn't added items to this module yet — check back soon.
              </p>
            ) : (
              <ol className="space-y-2 list-decimal list-inside">
                {module.items.map((it, idx) => {
                  if (it.kind === 'article') {
                    const a = articles.find((x) => x.id === it.ref_id);
                    return (
                      <li key={idx}>
                        <Link
                          to={`/articles/${a?.slug ?? it.ref_id}`}
                          className="text-kotoba-primary hover:underline"
                        >
                          {a?.title || `Article #${it.ref_id}`}
                        </Link>
                      </li>
                    );
                  }
                  return (
                    <li key={idx} className="text-kotoba-text">
                      Homework drill #{it.ref_id}
                      <span className="text-xs text-kotoba-text/60 ml-2">(check your homework list)</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ) : (
          <section className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <p className="text-sm text-kotoba-text/70 uppercase tracking-wider">One-time purchase</p>
            <p className="mt-1 text-4xl font-extrabold text-kotoba-primary">
              {formatPrice(module.price_cents, module.currency)}
            </p>
            <p className="mt-2 text-sm text-kotoba-text/70">
              {module.item_count} {module.item_count === 1 ? 'lesson' : 'lessons'} · permanent access
            </p>
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={buy}
              disabled={buying}
              className="mt-5 px-8 py-3 rounded-lg bg-kotoba-secondary text-kotoba-text font-bold hover:bg-kotoba-secondary-dark disabled:opacity-50"
            >
              {buying ? 'Loading…' : token ? 'Buy this module' : 'Sign in to buy'}
            </button>
            <p className="mt-3 text-xs text-kotoba-text/60">
              Payment handled by Stripe. Refunds at the tutor's discretion.
            </p>
          </section>
        )}
      </main>
    </div>
  );
};

export default ModuleDetail;
