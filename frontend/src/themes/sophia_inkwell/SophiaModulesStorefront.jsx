import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaArrowRight, FaBookOpen } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

// SophiaModulesStorefront — themed `/modules` storefront for Sophia's
// tenant. Backend integration mirrors DafniModulesStorefront and the
// default ModuleStorefront exactly: GET /modules returns the public
// list of published modules. The component is content-agnostic — it
// renders whatever modules the backend returns under the
// `theme-sophia-inkwell-site` scope so any future module Sophia adds
// is themed automatically.

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£' };
const formatPrice = (cents, currency) => {
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  const sym = CURRENCY_SYMBOL[String(currency || 'EUR').toUpperCase()] || `${currency || ''} `;
  return `${sym}${text}`;
};

const SophiaModulesStorefront = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [params] = useSearchParams();
  const justSubscribed = params.get('subscribed') === '1';
  const [modules, setModules] = useState(null);
  const [error, setError] = useState(null);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

  useEffect(() => {
    let cancelled = false;
    client
      .get('/modules')
      .then((res) => { if (!cancelled) setModules(Array.isArray(res.data) ? res.data : []); })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Could not load modules.');
        setModules([]);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Modules — English with ${firstName}`}
    >
      <main className="s-content-wide">
        <span className="s-eyebrow s-mod-eyebrow">
          <FaBookOpen size={13} aria-hidden="true" /> Self-paced
        </span>
        <h1 className="s-pt">Modules</h1>
        <p className="s-pt-sub">
          Curriculum bundles you work through at your own pace. One-time purchase, permanent access.
        </p>

        {justSubscribed && (
          <div className="s-form-success">
            Subscription active — every module and premium homework is yours now.
          </div>
        )}
        {error && <p className="s-form-error">{error}</p>}

        {modules === null && <div className="s-empty">Loading…</div>}
        {modules && modules.length === 0 && !error && (
          <div className="s-empty">
            No modules published yet. Check back soon — {firstName} is writing.
          </div>
        )}

        {modules && modules.length > 0 && (
          <div className="s-mod-grid">
            {modules.map((m) => (
              <Link
                key={m.id}
                to={`/modules/${m.slug}`}
                className="s-mod-card"
              >
                {m.featured_image_url ? (
                  <img
                    src={m.featured_image_url}
                    alt={m.title}
                    className="s-mod-card-img"
                  />
                ) : (
                  <div className="s-mod-card-img s-mod-card-img-fallback">
                    <span>{(m.title || '?').charAt(0)}</span>
                  </div>
                )}
                <div className="s-mod-card-body">
                  <h3 className="s-mod-card-title">{m.title}</h3>
                  {m.summary && (
                    <p className="s-mod-card-summary">{m.summary}</p>
                  )}
                  <div className="s-mod-card-meta">
                    <span className="s-mod-card-price">
                      {formatPrice(m.price_cents, m.currency)}
                    </span>
                    <span className="s-mod-card-count">
                      {m.item_count || 0} {(m.item_count || 0) === 1 ? 'item' : 'items'}
                      {(m.preview_item_count || 0) > 0 && (
                        <span className="s-mod-card-free"> · {m.preview_item_count} free</span>
                      )}
                    </span>
                  </div>
                  <span className="s-mod-card-cta">
                    View module <FaArrowRight size={12} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </SophiaLayout>
  );
};

export default SophiaModulesStorefront;
