import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaArrowRight, FaBookOpen } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import DafniLayout from './DafniLayout';
import './dafni_botanical.css';

// DafniModulesStorefront — themed `/modules` storefront for Dafni's
// tenant. Backend integration mirrors VassoModulesStorefront and the
// default ModuleStorefront exactly: GET /modules returns the public
// list of published modules (item_count, preview_item_count,
// featured_image_url, price_cents, currency, slug, summary). The
// component is content-agnostic — it renders whatever modules the
// backend returns under the `theme-dafni-botanical-site` scope so any
// future module Dafni adds is themed automatically.

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£' };
const formatPrice = (cents, currency) => {
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  const sym = CURRENCY_SYMBOL[String(currency || 'EUR').toUpperCase()] || `${currency || ''} `;
  return `${sym}${text}`;
};

const DafniModulesStorefront = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [params] = useSearchParams();
  const justSubscribed = params.get('subscribed') === '1';
  const [modules, setModules] = useState(null);
  const [error, setError] = useState(null);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Dafni';

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
    <DafniLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Modules — Learn with ${firstName}`}
    >
      <main className="d-content-wide">
        <span className="d-eyebrow d-mod-eyebrow">
          <FaBookOpen size={13} aria-hidden="true" /> Self-paced
        </span>
        <h1 className="d-pt">Modules</h1>
        <p className="d-pt-sub">
          Curriculum bundles you work through at your own pace. One-time purchase, permanent access.
        </p>

        {justSubscribed && (
          <div className="d-form-success">
            Subscription active — every module and premium homework is yours now.
          </div>
        )}
        {error && <p className="d-form-error">{error}</p>}

        {modules === null && <div className="d-empty">Loading…</div>}
        {modules && modules.length === 0 && !error && (
          <div className="d-empty">
            No modules published yet. Check back soon — {firstName} is writing.
          </div>
        )}

        {modules && modules.length > 0 && (
          <div className="d-mod-grid">
            {modules.map((m) => (
              <Link
                key={m.id}
                to={`/modules/${m.slug}`}
                className="d-mod-card"
              >
                {m.featured_image_url ? (
                  <img
                    src={m.featured_image_url}
                    alt={m.title}
                    className="d-mod-card-img"
                  />
                ) : (
                  <div className="d-mod-card-img d-mod-card-img-fallback">
                    <span>{(m.title || '?').charAt(0)}</span>
                  </div>
                )}
                <div className="d-mod-card-body">
                  <h3 className="d-mod-card-title">{m.title}</h3>
                  {m.summary && (
                    <p className="d-mod-card-summary">{m.summary}</p>
                  )}
                  <div className="d-mod-card-meta">
                    <span className="d-mod-card-price">
                      {formatPrice(m.price_cents, m.currency)}
                    </span>
                    <span className="d-mod-card-count">
                      {m.item_count || 0} {(m.item_count || 0) === 1 ? 'item' : 'items'}
                      {(m.preview_item_count || 0) > 0 && (
                        <span className="d-mod-card-free"> · {m.preview_item_count} free</span>
                      )}
                    </span>
                  </div>
                  <span className="d-mod-card-cta">
                    View module <FaArrowRight size={12} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </DafniLayout>
  );
};

export default DafniModulesStorefront;
