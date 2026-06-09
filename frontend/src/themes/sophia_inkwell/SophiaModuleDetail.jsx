import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaLock } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

// SophiaModuleDetail — themed `/modules/:slug` for Sophia's tenant.
// Backend integration mirrors DafniModuleDetail and the default
// ModuleDetail exactly:
//   GET /modules/:slug         → module + items + purchased flag
//   POST /tutor/modules/:id/checkout → Stripe Checkout handoff
// The preview-item logic, login redirect, and access-check semantics
// are identical. The component is content-agnostic — it renders
// whatever module data the backend returns, themed under
// `.theme-sophia-inkwell-site`.

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£' };
const formatPrice = (cents, currency) => {
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  const sym = CURRENCY_SYMBOL[String(currency || 'EUR').toUpperCase()] || `${currency || ''} `;
  return `${sym}${text}`;
};

// Calligraphic flourish marker — a single ink stroke beside each
// lesson number. Carries the Inkwell signature into the module list.
const FlourishMarker = () => (
  <svg
    className="s-mod-flourish"
    width="22"
    height="26"
    viewBox="0 0 100 110"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M50 8 C40 22 30 40 30 60 C30 78 40 92 50 102"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M50 8 C60 22 70 40 70 60 C70 78 60 92 50 102"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M50 8 L50 102"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      opacity="0.6"
    />
  </svg>
);

const SophiaModuleDetail = ({ tutor }) => {
  const { slug } = useParams();
  const { currentUser, logout, token } = useAuth();
  const [params] = useSearchParams();
  const justPaid = params.get('paid') === '1';
  const [module, setModule] = useState(null);
  const [error, setError] = useState(null);
  const [buying, setBuying] = useState(false);
  const [waiveWithdrawal, setWaiveWithdrawal] = useState(false);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    client
      .get(`/modules/${slug}`)
      .then((res) => { if (!cancelled) setModule(res.data); })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 404) setError('Module not found');
        else setError(err?.message || 'Could not load this module');
      });
    return () => { cancelled = true; };
  }, [slug]);

  const buy = async () => {
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
      return;
    }
    setBuying(true);
    setError(null);
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
      setError(err?.response?.data?.detail || 'Checkout failed.');
    } finally {
      setBuying(false);
    }
  };

  if (error && !module) {
    return (
      <SophiaLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Module not found — English with ${firstName}`}
      >
        <main className="s-content s-mod-notfound">
          <p className="s-mod-notfound-mark">S</p>
          <h1 className="s-mod-notfound-title">{error}</h1>
          <Link to="/modules" className="s-btn s-btn-outline">
            All modules
          </Link>
        </main>
      </SophiaLayout>
    );
  }

  if (!module) {
    return (
      <SophiaLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Loading — English with ${firstName}`}
      >
        <main className="s-content s-empty">Loading…</main>
      </SophiaLayout>
    );
  }

  const items = module.items || [];

  return (
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`${module.title} — English with ${firstName}`}
    >
      <main className="s-content s-mod-detail">
        <Link to="/modules" className="s-mod-back">
          <FaArrowLeft size={14} aria-hidden="true" /> All modules
        </Link>

        {justPaid && (
          <div className="s-form-success">
            Payment received — your access is unlocked below. Welcome.
          </div>
        )}

        {module.featured_image_url && (
          <img
            src={module.featured_image_url}
            alt={module.title}
            className="s-mod-hero-img"
          />
        )}

        <header className="s-mod-head">
          <span className="s-eyebrow">Self-paced module</span>
          <h1 className="s-mod-title">{module.title}</h1>
          {module.summary && (
            <p className="s-mod-summary">{module.summary}</p>
          )}
          {module.description && (
            <p className="s-mod-desc">{module.description}</p>
          )}
        </header>

        <section className="s-mod-section">
          <div className="s-mod-section-head">
            <h2 className="s-mod-section-title">
              {module.purchased ? 'Your content' : 'What you get'}
            </h2>
            {!module.purchased && (module.preview_item_count || 0) > 0 && (
              <span className="s-mod-section-meta">
                {module.preview_item_count} free preview · {(module.item_count || 0) - module.preview_item_count} unlocked after purchase
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <p className="s-mod-empty">
              No items in this module yet — check back soon.
            </p>
          ) : (
            <ol className="s-mod-lessons">
              {items.map((it, idx) => {
                const unlocked = module.purchased || it.preview;
                return (
                  <li
                    key={idx}
                    className={`s-mod-lesson${unlocked ? '' : ' s-mod-lesson-locked'}`}
                  >
                    <span className="s-mod-lesson-marker" aria-hidden="true">
                      <FlourishMarker />
                      <span className="s-mod-lesson-n">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </span>
                    <div className="s-mod-lesson-body">
                      <div className="s-mod-lesson-row">
                        {unlocked && it.kind === 'article' && it.slug ? (
                          <Link
                            to={`/articles/${it.slug}`}
                            className="s-mod-lesson-title s-mod-lesson-link"
                          >
                            {it.title}
                          </Link>
                        ) : (
                          <span className={`s-mod-lesson-title${unlocked ? '' : ' s-mod-lesson-title-locked'}`}>
                            {it.title}
                          </span>
                        )}
                        {it.preview && !module.purchased && (
                          <span className="s-mod-pill s-mod-pill-preview">
                            Free preview
                          </span>
                        )}
                        {!unlocked && (
                          <span className="s-mod-pill s-mod-pill-locked">
                            <FaLock size={10} aria-hidden="true" /> Unlocks after purchase
                          </span>
                        )}
                        {it.kind === 'homework' && (
                          <span className="s-mod-pill s-mod-pill-tag">
                            Homework{it.question_count ? ` · ${it.question_count} questions` : ''}
                          </span>
                        )}
                      </div>
                      {it.summary && (
                        <p className="s-mod-lesson-summary">{it.summary}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {!module.purchased && (
          <section className="s-mod-buy">
            <span className="s-eyebrow">One-time purchase · permanent access</span>
            <p className="s-mod-buy-price">
              {formatPrice(module.price_cents, module.currency)}
            </p>
            <p className="s-mod-buy-meta">
              {module.item_count || 0} {(module.item_count || 0) === 1 ? 'lesson' : 'lessons'} · yours forever
            </p>
            {error && <p className="s-form-error">{error}</p>}
            {token && (
              <label className="s-checkbox-row" style={{ fontSize: 12, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={waiveWithdrawal}
                  onChange={(e) => setWaiveWithdrawal(e.target.checked)}
                />
                <span>
                  I want access right after payment, so I waive my 14-day right of withdrawal under the EU Consumer Rights Directive (Article 16(m)).
                </span>
              </label>
            )}
            <button
              type="button"
              onClick={buy}
              disabled={buying || (token && !waiveWithdrawal)}
              className="s-btn s-btn-primary s-btn-lg s-mod-buy-cta"
            >
              {buying ? 'Loading…' : token ? 'Buy this module' : 'Sign in to buy'}
            </button>
          </section>
        )}
      </main>
    </SophiaLayout>
  );
};

export default SophiaModuleDetail;
