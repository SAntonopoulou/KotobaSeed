import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaArrowRight, FaBookOpen } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

// VassoModulesStorefront — themed `/modules` storefront. The source
// greekvasso site doesn't have an exact equivalent; the treatment
// here is a faithful extension of her in-app design language
// (`.panel` cards, eyebrow + h1.pt + pt-sub heading block, lesson
// card detail rows).

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£' };
const formatPrice = (cents, currency) => {
  const major = (cents || 0) / 100;
  const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
  const sym = CURRENCY_SYMBOL[String(currency || 'EUR').toUpperCase()] || `${currency || ''} `;
  return `${sym}${text}`;
};

const VassoModulesStorefront = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [params] = useSearchParams();
  const justSubscribed = params.get('subscribed') === '1';
  const [modules, setModules] = useState(null);
  const [error, setError] = useState(null);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Vasso';

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
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="Modules — Learn Greek with Vasso"
    >
      <main className="content-wide">
        <p className="eyebrow-inline">
          <FaBookOpen size={14} /> Self-paced
        </p>
        <h1 className="pt">Modules</h1>
        <p className="pt-sub">
          Curriculum bundles you work through at your own pace. One-time purchase, permanent access.
        </p>

        {justSubscribed && (
          <div className="form-note">
            Subscription active — every module + premium homework is yours now.
          </div>
        )}
        {error && <p className="form-error">{error}</p>}

        {modules === null && <div className="empty">Loading…</div>}
        {modules && modules.length === 0 && !error && (
          <div className="empty">
            No modules published yet. Check back soon — {firstName} is writing.
          </div>
        )}

        {modules && modules.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
            marginTop: 8,
          }}>
            {modules.map((m) => (
              <Link
                key={m.id}
                to={`/modules/${m.slug}`}
                className="panel"
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                {m.featured_image_url ? (
                  <img
                    src={m.featured_image_url}
                    alt={m.title}
                    style={{
                      width: '100%',
                      height: 160,
                      objectFit: 'cover',
                      borderBottom: '1px solid var(--border)',
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: 160,
                    display: 'grid',
                    placeItems: 'center',
                    background:
                      'radial-gradient(ellipse 60% 70% at 30% 30%, rgba(232,184,75,0.35), transparent 70%), rgba(10,79,138,0.06)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: 72,
                      color: 'rgba(10,79,138,0.35)',
                    }}>
                      {(m.title || '?').charAt(0)}
                    </span>
                  </div>
                )}
                <div style={{ padding: 22, display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <h3 style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 19,
                    margin: 0,
                    letterSpacing: '-0.01em',
                    color: 'var(--fg)',
                  }}>
                    {m.title}
                  </h3>
                  {m.summary && (
                    <p style={{
                      margin: '8px 0 0',
                      fontSize: 14.5,
                      lineHeight: 1.55,
                      color: 'var(--fg-muted)',
                      flex: 1,
                    }}>
                      {m.summary}
                    </p>
                  )}
                  <div style={{
                    marginTop: 18,
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: 24,
                      color: 'var(--fg)',
                      letterSpacing: '-0.01em',
                    }}>
                      {formatPrice(m.price_cents, m.currency)}
                    </span>
                    <span style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: 'var(--fg-subtle)',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}>
                      {m.item_count || 0} {(m.item_count || 0) === 1 ? 'item' : 'items'}
                      {(m.preview_item_count || 0) > 0 && (
                        <span style={{ color: 'var(--brand)' }}> · {m.preview_item_count} free</span>
                      )}
                    </span>
                  </div>
                  <div style={{
                    marginTop: 14,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--brand)',
                    fontWeight: 600,
                    fontSize: 13.5,
                  }}>
                    View module <FaArrowRight size={13} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </VassoLayout>
  );
};

export default VassoModulesStorefront;
