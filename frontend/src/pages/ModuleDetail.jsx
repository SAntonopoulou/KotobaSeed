import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import BookingDialog from '../components/BookingDialog';
import { useAuth } from '../context/AuthContext';
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

const pickFeaturedPack = (packs) => {
  if (!Array.isArray(packs) || packs.length === 0) return null;
  const single = packs.find(
    (p) => !p.is_group && (p.num_lessons === 1 || p.num_lessons == null)
  );
  return single || packs[0];
};

const RevealBlock = ({ children, delay = 0, className = '' }) => {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={`v2-reveal ${visible ? 'is-revealed' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
};

const ModuleDetail = () => {
  const { slug } = useParams();
  const { token, currentUser } = useAuth();
  const [params] = useSearchParams();
  const justPaid = params.get('paid') === '1';
  const [module, setModule] = useState(null);
  const [tutor, setTutor] = useState(null);
  const [packs, setPacks] = useState([]);
  const [trial, setTrial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  const [waiveWithdrawal, setWaiveWithdrawal] = useState(false);
  const [bookingPack, setBookingPack] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [mRes, tRes, pRes, trRes] = await Promise.all([
          client.get(`/modules/${slug}`),
          client.get('/tutor/me'),
          client.get('/tutor/lesson-packs').catch(() => ({ data: [] })),
          client.get('/tutor/trial').catch(() => ({ data: null })),
        ]);
        setModule(mRes.data);
        setTutor(tRes.data || null);
        setPacks(pRes.data || []);
        setTrial(trRes.data || null);
      } catch (err) {
        setError(getErrorMessage(err, 'Module not found.'));
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
      const res = await client.post(`/tutor/modules/${module.id}/checkout`, {
        waive_withdrawal: true,
      });
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setError('Could not start checkout.');
    } catch (err) {
      setError(getErrorMessage(err, 'Checkout failed.'));
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kotoba-background font-sans">
        <p className="text-kotoba-text/60">Loading…</p>
      </div>
    );
  }
  if (error && !module) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kotoba-background p-4 font-sans">
        <div className="bg-white rounded-3xl shadow-soft p-8 max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-kotoba-primary mb-2">Not here</h1>
          <p className="text-kotoba-text/70">{error}</p>
          <Link
            to="/modules"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-kotoba-primary hover:gap-2.5 transition-all"
          >
            <span aria-hidden="true">←</span> All modules
          </Link>
        </div>
      </div>
    );
  }

  const featuredPack = pickFeaturedPack(packs);
  const initial = (tutor?.display_name || tutor?.tutor_slug || '?')
    .trim()
    .charAt(0)
    .toUpperCase();
  const isOwner = currentUser && tutor && currentUser.id === tutor.user_id;

  return (
    <div className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-kotoba-text/[0.06]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
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
            to="/modules"
            className="text-sm text-kotoba-text/70 hover:text-kotoba-primary inline-flex items-center gap-1.5"
          >
            <span aria-hidden="true">←</span> All modules
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-6">
        {justPaid && (
          <RevealBlock>
            <div className="bg-kotoba-secondary/30 border border-kotoba-secondary text-kotoba-text px-5 py-4 rounded-2xl text-sm font-medium">
              Payment received — your access is unlocked below. Welcome.
            </div>
          </RevealBlock>
        )}

        {module.featured_image_url && (
          <RevealBlock>
            <img
              src={module.featured_image_url}
              alt={module.title}
              className="w-full rounded-3xl object-cover max-h-80 shadow-soft"
            />
          </RevealBlock>
        )}

        <RevealBlock>
          <header className="bg-white rounded-3xl shadow-soft p-7 sm:p-9">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              Self-paced module
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
              {module.title}
            </h1>
            {module.summary && (
              <p className="mt-3 text-lg text-kotoba-text/75 leading-relaxed">
                {module.summary}
              </p>
            )}
            {module.description && (
              <p className="mt-4 text-base text-kotoba-text/80 whitespace-pre-line leading-relaxed">
                {module.description}
              </p>
            )}
          </header>
        </RevealBlock>

        <RevealBlock delay={60}>
          <section className="bg-white rounded-3xl shadow-soft p-7">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-5">
              <h2 className="font-display text-xl font-bold text-kotoba-primary">
                {module.purchased ? 'Your content' : 'What you get'}
              </h2>
              {!module.purchased && module.preview_item_count > 0 && (
                <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/60">
                  {module.preview_item_count} free preview ·{' '}
                  {module.item_count - module.preview_item_count} unlocked after purchase
                </span>
              )}
            </div>

            {module.items.length === 0 ? (
              <p className="text-sm text-kotoba-text/70">
                The tutor hasn't added items to this module yet — check back soon.
              </p>
            ) : (
              <ol className="space-y-3 list-none">
                {module.items.map((it, idx) => {
                  const unlocked = module.purchased || it.preview;
                  return (
                    <li
                      key={idx}
                      className={
                        'flex items-start gap-3 p-4 rounded-2xl border transition-colors ' +
                        (unlocked
                          ? 'border-kotoba-primary/15 bg-kotoba-background/40 hover:border-kotoba-primary/30'
                          : 'border-kotoba-text/[0.06] bg-kotoba-text/[0.03]')
                      }
                    >
                      <span className="font-mono text-xs text-kotoba-text/40 pt-0.5 tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {unlocked && it.kind === 'article' && it.slug ? (
                            <Link
                              to={`/articles/${it.slug}`}
                              className="font-display font-bold text-kotoba-primary hover:underline"
                            >
                              {it.title}
                            </Link>
                          ) : (
                            <span
                              className={
                                'font-display font-bold ' +
                                (unlocked ? 'text-kotoba-text' : 'text-kotoba-text/60')
                              }
                            >
                              {it.title}
                            </span>
                          )}
                          {it.preview && !module.purchased && (
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-kotoba-primary bg-kotoba-primary/15 px-2 py-0.5 rounded">
                              Free preview
                            </span>
                          )}
                          {!unlocked && (
                            <span className="inline-flex items-center gap-1 text-xs text-kotoba-text/40">
                              <span aria-hidden="true">🔒</span>
                              Unlocks after purchase
                            </span>
                          )}
                          {it.kind === 'homework' && (
                            <span className="text-xs text-kotoba-text/60">
                              Homework
                              {it.question_count ? ` · ${it.question_count} questions` : ''}
                            </span>
                          )}
                        </div>
                        {it.summary && (
                          <p className="mt-1.5 text-sm text-kotoba-text/70 leading-relaxed">{it.summary}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </RevealBlock>

        {!module.purchased && (
          <RevealBlock delay={100}>
            <section className="rounded-3xl bg-gradient-to-br from-kotoba-primary/[0.06] via-white to-kotoba-secondary/15 border border-kotoba-primary/15 p-8 text-center shadow-soft">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                One-time purchase · permanent access
              </p>
              <p className="mt-3 font-display text-5xl font-bold text-kotoba-primary tracking-[-0.02em]">
                {formatPrice(module.price_cents, module.currency)}
              </p>
              <p className="mt-2 text-sm text-kotoba-text/70">
                {module.item_count} {module.item_count === 1 ? 'lesson' : 'lessons'} · yours forever
              </p>
              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-2xl text-sm">
                  {error}
                </div>
              )}
              {token && (
                <label className="mt-5 flex items-start gap-2 text-left text-xs text-kotoba-text/70 max-w-md mx-auto">
                  <input
                    type="checkbox"
                    checked={waiveWithdrawal}
                    onChange={(e) => setWaiveWithdrawal(e.target.checked)}
                    className="mt-0.5 h-4 w-4 text-kotoba-primary rounded focus:ring-kotoba-primary border-kotoba-text/20"
                  />
                  <span>
                    I want access right after payment, so I waive my 14-day right of withdrawal under the EU Consumer Rights Directive (Article 16(m)). I understand that, by ticking this box, I lose my refund right once I open the module.
                  </span>
                </label>
              )}
              <button
                type="button"
                onClick={buy}
                disabled={buying || (token && !waiveWithdrawal)}
                className="group mt-4 inline-flex items-center justify-center px-8 py-3.5 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft-lg hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {buying ? 'Loading…' : token ? 'Buy this module' : 'Sign in to buy'}
                <span
                  className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  →
                </span>
              </button>
              <p className="mt-3 text-xs text-kotoba-text/55">
                Payment handled by Stripe. Refunds at the tutor's discretion.
              </p>
            </section>
          </RevealBlock>
        )}

        {/* Book-a-lesson cross-sell — for non-owners only. Modules are
            self-paced content; a live lesson is the natural next step. */}
        {tutor && !isOwner && (trial || featuredPack) && (
          <RevealBlock delay={140}>
            <section className="rounded-3xl bg-kotoba-primary text-white shadow-soft-lg overflow-hidden relative isolate">
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10"
                style={{
                  background:
                    'radial-gradient(ellipse 60% 70% at 100% 0%, rgba(214,164,47,0.30), transparent 60%),' +
                    'radial-gradient(ellipse 40% 40% at 0% 100%, rgba(255,255,255,0.06), transparent 70%)',
                }}
              />
              <div className="v2-noise" />
              <div className="relative p-7 sm:p-9">
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-kotoba-secondary/30 backdrop-blur-sm flex items-center justify-center font-display text-2xl sm:text-3xl font-bold text-kotoba-secondary">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary">
                      Want it live?
                    </p>
                    <h3 className="mt-2 font-display text-2xl sm:text-3xl font-bold leading-tight">
                      Pair this with a lesson from{' '}
                      <span className="italic">{tutor.display_name || 'this tutor'}.</span>
                    </h3>
                    <p className="mt-3 text-sm sm:text-base text-white/80 leading-relaxed max-w-xl">
                      Self-paced modules are great. Live conversation is where the patterns
                      actually stick. Try a free 15-minute trial first.
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  {trial && (
                    <button
                      type="button"
                      onClick={() =>
                        setBookingPack({
                          isTrial: true,
                          duration_minutes: trial.duration_minutes || 15,
                        })
                      }
                      className="group inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-kotoba-secondary text-kotoba-text font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
                    >
                      Book free 15-min trial
                      <span
                        className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </button>
                  )}
                  {featuredPack && (
                    <button
                      type="button"
                      onClick={() => setBookingPack(featuredPack)}
                      className="inline-flex items-center justify-center px-6 py-3 rounded-2xl border border-white/25 text-white font-semibold hover:bg-white/10 transition-colors duration-300"
                    >
                      Book a lesson
                      <span className="ml-2 text-white/70 text-sm">
                        {formatPrice(featuredPack.price_cents, featuredPack.currency)}
                        {featuredPack.duration_minutes
                          ? ` · ${featuredPack.duration_minutes} min`
                          : ''}
                      </span>
                    </button>
                  )}
                  <Link
                    to="/"
                    className="inline-flex items-center px-3 text-sm text-white/70 hover:text-white"
                  >
                    See all options →
                  </Link>
                </div>
              </div>
            </section>
          </RevealBlock>
        )}
      </main>

      {bookingPack && (
        <BookingDialog
          pack={bookingPack}
          tutorDisplayName={tutor?.display_name || 'this tutor'}
          onClose={() => setBookingPack(null)}
        />
      )}
    </div>
  );
};

export default ModuleDetail;
