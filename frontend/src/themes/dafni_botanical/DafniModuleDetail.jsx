import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaLock } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import DafniLayout from './DafniLayout';
import './dafni_botanical.css';

// DafniModuleDetail — themed `/modules/:slug` for Dafni's tenant.
// Backend integration mirrors VassoModuleDetail and the default
// ModuleDetail exactly:
//   GET /modules/:slug         → module + items + purchased flag
//   POST /tutor/modules/:id/checkout → Stripe Checkout handoff
// The Plus subscription gate, preview-item logic, login redirect,
// and access-check semantics are identical. The component is
// content-agnostic — it renders whatever module data the backend
// returns, themed under `.theme-dafni-botanical-site`.

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£' };
const formatPrice = (cents, currency) => {
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  const sym = CURRENCY_SYMBOL[String(currency || 'EUR').toUpperCase()] || `${currency || ''} `;
  return `${sym}${text}`;
};

// Leaf marker — reused from the FeaturesLeafDividers / LevelsLeafPillars
// vocabulary. A small two-lobe stem that sits next to each lesson
// number to carry the botanical signature through.
const LeafMarker = () => (
  <svg
    className="d-mod-leaf"
    width="22"
    height="26"
    viewBox="0 0 100 110"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M50 100 C50 82 50 56 50 22 C36 24 24 36 22 56 C22 72 34 88 50 100 Z"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <path
      d="M50 100 C50 82 50 56 50 22 C64 24 76 36 78 56 C78 72 66 88 50 100 Z"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <path d="M50 100 L50 30" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const DafniModuleDetail = ({ tutor }) => {
  const { slug } = useParams();
  const { currentUser, logout, token } = useAuth();
  const [params] = useSearchParams();
  const justPaid = params.get('paid') === '1';
  const [module, setModule] = useState(null);
  const [error, setError] = useState(null);
  const [buying, setBuying] = useState(false);
  const [waiveWithdrawal, setWaiveWithdrawal] = useState(false);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Dafni';

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
      <DafniLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Module not found — Learn with ${firstName}`}
      >
        <main className="d-content d-mod-notfound">
          <p className="d-mod-notfound-mark">δ</p>
          <h1 className="d-mod-notfound-title">{error}</h1>
          <Link to="/modules" className="d-btn d-btn-outline">
            All modules
          </Link>
        </main>
      </DafniLayout>
    );
  }

  if (!module) {
    return (
      <DafniLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Loading — Learn with ${firstName}`}
      >
        <main className="d-content d-empty">Loading…</main>
      </DafniLayout>
    );
  }

  const items = module.items || [];

  return (
    <DafniLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`${module.title} — Learn with ${firstName}`}
    >
      <main className="d-content d-mod-detail">
        <Link to="/modules" className="d-mod-back">
          <FaArrowLeft size={14} aria-hidden="true" /> All modules
        </Link>

        {justPaid && (
          <div className="d-form-success">
            Payment received — your access is unlocked below. Welcome.
          </div>
        )}

        {module.featured_image_url && (
          <img
            src={module.featured_image_url}
            alt={module.title}
            className="d-mod-hero-img"
          />
        )}

        <header className="d-mod-head">
          <span className="d-eyebrow">Self-paced module</span>
          <h1 className="d-mod-title">{module.title}</h1>
          {module.summary && (
            <p className="d-mod-summary">{module.summary}</p>
          )}
          {module.description && (
            <p className="d-mod-desc">{module.description}</p>
          )}
        </header>

        <section className="d-mod-section">
          <div className="d-mod-section-head">
            <h2 className="d-mod-section-title">
              {module.purchased ? 'Your content' : 'What you get'}
            </h2>
            {!module.purchased && (module.preview_item_count || 0) > 0 && (
              <span className="d-mod-section-meta">
                {module.preview_item_count} free preview · {(module.item_count || 0) - module.preview_item_count} unlocked after purchase
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <p className="d-mod-empty">
              No items in this module yet — check back soon.
            </p>
          ) : (
            <ol className="d-mod-lessons">
              {items.map((it, idx) => {
                const unlocked = module.purchased || it.preview;
                return (
                  <li
                    key={idx}
                    className={`d-mod-lesson${unlocked ? '' : ' d-mod-lesson-locked'}`}
                  >
                    <span className="d-mod-lesson-marker" aria-hidden="true">
                      <LeafMarker />
                      <span className="d-mod-lesson-n">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </span>
                    <div className="d-mod-lesson-body">
                      <div className="d-mod-lesson-row">
                        {unlocked && it.kind === 'article' && it.slug ? (
                          <Link
                            to={`/articles/${it.slug}`}
                            className="d-mod-lesson-title d-mod-lesson-link"
                          >
                            {it.title}
                          </Link>
                        ) : (
                          <span className={`d-mod-lesson-title${unlocked ? '' : ' d-mod-lesson-title-locked'}`}>
                            {it.title}
                          </span>
                        )}
                        {it.preview && !module.purchased && (
                          <span className="d-mod-pill d-mod-pill-preview">
                            Free preview
                          </span>
                        )}
                        {!unlocked && (
                          <span className="d-mod-pill d-mod-pill-locked">
                            <FaLock size={10} aria-hidden="true" /> Unlocks after purchase
                          </span>
                        )}
                        {it.kind === 'homework' && (
                          <span className="d-mod-pill d-mod-pill-tag">
                            Homework{it.question_count ? ` · ${it.question_count} questions` : ''}
                          </span>
                        )}
                      </div>
                      {it.summary && (
                        <p className="d-mod-lesson-summary">{it.summary}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {!module.purchased && (
          <section className="d-mod-buy">
            <span className="d-eyebrow">One-time purchase · permanent access</span>
            <p className="d-mod-buy-price">
              {formatPrice(module.price_cents, module.currency)}
            </p>
            <p className="d-mod-buy-meta">
              {module.item_count || 0} {(module.item_count || 0) === 1 ? 'lesson' : 'lessons'} · yours forever
            </p>
            {error && <p className="d-form-error">{error}</p>}
            {token && (
              <label className="d-checkbox-row" style={{ fontSize: 12, marginBottom: 12 }}>
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
              className="d-btn d-btn-primary d-btn-lg d-mod-buy-cta"
            >
              {buying ? 'Loading…' : token ? 'Buy this module' : 'Sign in to buy'}
            </button>
          </section>
        )}
      </main>
    </DafniLayout>
  );
};

export default DafniModuleDetail;
