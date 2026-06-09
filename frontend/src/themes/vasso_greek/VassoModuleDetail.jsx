import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaLock } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

// VassoModuleDetail — themed `/modules/:slug`. Same backend
// integration as the default ModuleDetail (GET /modules/:slug for the
// module + items list, POST /tutor/modules/:id/checkout for the
// Stripe handoff). UI follows the .panel + .pt + .pt-sub system.

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£' };
const formatPrice = (cents, currency) => {
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  const sym = CURRENCY_SYMBOL[String(currency || 'EUR').toUpperCase()] || `${currency || ''} `;
  return `${sym}${text}`;
};

const VassoModuleDetail = ({ tutor }) => {
  const { slug } = useParams();
  const { currentUser, logout, token } = useAuth();
  const [params] = useSearchParams();
  const justPaid = params.get('paid') === '1';
  const [module, setModule] = useState(null);
  const [error, setError] = useState(null);
  const [buying, setBuying] = useState(false);
  const [waiveWithdrawal, setWaiveWithdrawal] = useState(false);

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
      <VassoLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle="Module not found — Learn Greek with Vasso"
      >
        <main className="content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{
            fontFamily: 'var(--font-logo)',
            fontWeight: 700,
            fontSize: 72,
            color: 'var(--honey-600)',
            margin: 0,
            lineHeight: 1,
          }}>α</p>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 24,
            margin: '14px 0 18px',
            color: 'var(--fg)',
          }}>{error}</h1>
          <Link to="/modules" className="v-btn v-btn-secondary v-btn-sm">
            All modules
          </Link>
        </main>
      </VassoLayout>
    );
  }

  if (!module) {
    return (
      <VassoLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle="Loading — Learn Greek with Vasso"
      >
        <main className="content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>
        </main>
      </VassoLayout>
    );
  }

  const items = module.items || [];

  return (
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`${module.title} — Learn Greek with Vasso`}
    >
      <main className="content" style={{ paddingTop: 40 }}>
        <Link to="/modules" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--fg-subtle)',
          fontSize: 14,
          textDecoration: 'none',
          marginBottom: 18,
        }}>
          <FaArrowLeft size={16} /> All modules
        </Link>

        {justPaid && (
          <div className="form-note">
            Payment received — your access is unlocked below. Welcome.
          </div>
        )}

        {module.featured_image_url && (
          <img
            src={module.featured_image_url}
            alt={module.title}
            style={{
              width: '100%',
              maxHeight: 320,
              objectFit: 'cover',
              borderRadius: 20,
              marginBottom: 24,
              boxShadow: 'var(--shadow-sm)',
            }}
          />
        )}

        <div className="panel panel-pad" style={{ marginBottom: 22 }}>
          <p className="eyebrow-inline">Self-paced module</p>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 36,
            margin: '10px 0 14px',
            letterSpacing: '-0.02em',
            color: 'var(--fg)',
            lineHeight: 1.1,
          }}>
            {module.title}
          </h1>
          {module.summary && (
            <p style={{
              fontSize: 17,
              color: 'var(--fg-muted)',
              lineHeight: 1.6,
              margin: '0 0 14px',
            }}>
              {module.summary}
            </p>
          )}
          {module.description && (
            <p style={{
              fontSize: 15.5,
              color: 'var(--fg)',
              lineHeight: 1.65,
              margin: 0,
              whiteSpace: 'pre-line',
            }}>
              {module.description}
            </p>
          )}
        </div>

        <div className="panel panel-pad" style={{ marginBottom: 22 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 18,
          }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 21,
              margin: 0,
              letterSpacing: '-0.01em',
              color: 'var(--fg)',
            }}>
              {module.purchased ? 'Your content' : 'What you get'}
            </h2>
            {!module.purchased && (module.preview_item_count || 0) > 0 && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--fg-subtle)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}>
                {module.preview_item_count} free preview · {(module.item_count || 0) - module.preview_item_count} unlocked after purchase
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <p style={{ fontSize: 14.5, color: 'var(--fg-muted)' }}>
              No items in this module yet — check back soon.
            </p>
          ) : (
            <ol style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {items.map((it, idx) => {
                const unlocked = module.purchased || it.preview;
                return (
                  <li
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: 14,
                      borderRadius: 14,
                      background: unlocked ? 'var(--bg-tint)' : 'var(--surface-sunk)',
                      border: `1px solid ${unlocked ? 'var(--border-cool)' : 'var(--border)'}`,
                    }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--fg-subtle)',
                      paddingTop: 3,
                      minWidth: 22,
                      fontWeight: 600,
                    }}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {unlocked && it.kind === 'article' && it.slug ? (
                          <Link
                            to={`/articles/${it.slug}`}
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontWeight: 700,
                              fontSize: 16,
                              color: 'var(--brand)',
                              textDecoration: 'none',
                            }}
                          >
                            {it.title}
                          </Link>
                        ) : (
                          <span style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            fontSize: 16,
                            color: unlocked ? 'var(--fg)' : 'var(--fg-muted)',
                          }}>
                            {it.title}
                          </span>
                        )}
                        {it.preview && !module.purchased && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'var(--brand)',
                            background: 'var(--brand-soft)',
                            padding: '3px 8px',
                            borderRadius: 4,
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                          }}>
                            Free preview
                          </span>
                        )}
                        {!unlocked && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 12,
                            color: 'var(--fg-subtle)',
                          }}>
                            <FaLock size={11} /> Unlocks after purchase
                          </span>
                        )}
                        {it.kind === 'homework' && (
                          <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                            Homework{it.question_count ? ` · ${it.question_count} questions` : ''}
                          </span>
                        )}
                      </div>
                      {it.summary && (
                        <p style={{
                          margin: '6px 0 0',
                          fontSize: 14,
                          color: 'var(--fg-muted)',
                          lineHeight: 1.55,
                        }}>
                          {it.summary}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {!module.purchased && (
          <div className="panel panel-pad" style={{ textAlign: 'center' }}>
            <p className="eyebrow-inline" style={{ justifyContent: 'center' }}>
              One-time purchase · permanent access
            </p>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 48,
              color: 'var(--fg)',
              margin: '12px 0 6px',
              letterSpacing: '-0.02em',
            }}>
              {formatPrice(module.price_cents, module.currency)}
            </p>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: '0 0 18px' }}>
              {module.item_count || 0} {(module.item_count || 0) === 1 ? 'lesson' : 'lessons'} · yours forever
            </p>
            {error && <p className="form-error">{error}</p>}
            {token && (
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 12,
                color: 'var(--fg-muted)',
                textAlign: 'left',
                margin: '0 auto 14px',
                maxWidth: 460,
                lineHeight: 1.5,
              }}>
                <input
                  type="checkbox"
                  checked={waiveWithdrawal}
                  onChange={(e) => setWaiveWithdrawal(e.target.checked)}
                  style={{ marginTop: 3 }}
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
              className="v-btn v-btn-gold v-btn-lg"
              style={{ minWidth: 220 }}
            >
              {buying ? 'Loading…' : token ? 'Buy this module' : 'Sign in to buy'}
            </button>
          </div>
        )}
      </main>
    </VassoLayout>
  );
};

export default VassoModuleDetail;
