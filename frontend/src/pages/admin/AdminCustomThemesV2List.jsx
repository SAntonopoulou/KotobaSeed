import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

// Admin index page for v2 custom themes. The list at the top of the
// existing AdminCustomThemes screen covers the design-service order
// workflow (deposit → concepts → revise → deliver). This screen is the
// separate upload-driven catalogue, so the designer doesn't have to
// touch the order queue when authoring a curated theme.

const tdBase = {
  padding: '12px 14px',
  fontSize: 13.5,
  borderBottom: '1px solid rgb(var(--kotoba-text-rgb) / 0.08)',
  color: 'rgb(var(--kotoba-text-rgb))',
  textAlign: 'left',
};

const thBase = {
  ...tdBase,
  fontWeight: 700,
  textTransform: 'uppercase',
  fontSize: 11,
  letterSpacing: '0.08em',
  color: 'rgb(var(--kotoba-text-rgb) / 0.6)',
  background: 'rgb(var(--kotoba-text-rgb) / 0.03)',
  textAlign: 'left',
};

const AdminCustomThemesV2List = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setError('');
    try {
      const res = await client.get('/admin/custom-themes/v2');
      setItems(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load themes.');
      setItems([]);
    }
  };

  useEffect(() => { load(); }, []);

  const togglePublish = async (theme) => {
    setBusyId(theme.id);
    try {
      const url = theme.is_public_catalogue
        ? `/admin/custom-themes/v2/${theme.id}/unpublish`
        : `/admin/custom-themes/v2/${theme.id}/publish`;
      await client.post(url);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not toggle publish.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 18px 80px', fontFamily: 'var(--font-sans, sans-serif)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgb(var(--kotoba-secondary-dark-rgb))', margin: 0 }}>
            v2 catalogue
          </p>
          <h1 style={{ fontFamily: 'var(--font-display, inherit)', fontWeight: 700, fontSize: 30, margin: '6px 0 0', color: 'rgb(var(--kotoba-primary-rgb))' }}>
            Custom themes
          </h1>
          <p style={{ fontSize: 13.5, color: 'rgb(var(--kotoba-text-rgb) / 0.7)', margin: '6px 0 0' }}>
            Upload-authored themes (palette + fonts + section layout). Tutors with the right ownership flip to one of these from their dashboard.
          </p>
        </div>
        <Link
          to="/admin/custom-themes/v2/new"
          style={{
            padding: '10px 18px',
            background: 'rgb(var(--kotoba-primary-rgb))',
            color: '#fff',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 13.5,
            textDecoration: 'none',
          }}
        >
          + New theme
        </Link>
      </header>

      {error && (
        <div style={{
          background: '#fee2e2',
          color: '#991b1b',
          border: '1px solid #fecaca',
          padding: '10px 14px',
          borderRadius: 12,
          marginBottom: 16,
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      <div style={{
        background: '#fff',
        border: '1px solid rgb(var(--kotoba-text-rgb) / 0.08)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 4px 14px -10px rgba(0,0,0,0.15)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thBase}>Name</th>
              <th style={thBase}>Theme key</th>
              <th style={thBase}>Catalogue</th>
              <th style={{ ...thBase, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items === null && (
              <tr><td colSpan={4} style={{ ...tdBase, color: 'rgb(var(--kotoba-text-rgb) / 0.6)' }}>Loading…</td></tr>
            )}
            {items && items.length === 0 && (
              <tr><td colSpan={4} style={{ ...tdBase, color: 'rgb(var(--kotoba-text-rgb) / 0.6)', textAlign: 'center' }}>
                No v2 themes yet. Create one to start the catalogue.
              </td></tr>
            )}
            {items && items.map((t) => (
              <tr key={t.id}>
                <td style={tdBase}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {t.preview_image_url && (
                      <img
                        src={t.preview_image_url}
                        alt=""
                        style={{ width: 42, height: 30, objectFit: 'cover', borderRadius: 6, border: '1px solid rgb(var(--kotoba-text-rgb) / 0.08)' }}
                      />
                    )}
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                  </div>
                </td>
                <td style={{ ...tdBase, fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, color: 'rgb(var(--kotoba-text-rgb) / 0.7)' }}>
                  {t.theme_key}
                </td>
                <td style={tdBase}>
                  {t.is_public_catalogue ? (
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 9px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      background: 'rgb(var(--kotoba-primary-rgb) / 0.12)',
                      color: 'rgb(var(--kotoba-primary-rgb))',
                    }}>Public</span>
                  ) : (
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 9px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      background: 'rgb(var(--kotoba-text-rgb) / 0.06)',
                      color: 'rgb(var(--kotoba-text-rgb) / 0.7)',
                    }}>Private</span>
                  )}
                </td>
                <td style={{ ...tdBase, textAlign: 'right' }}>
                  <Link
                    to={`/admin/custom-themes/v2/${t.id}/edit`}
                    style={{
                      fontSize: 13,
                      color: 'rgb(var(--kotoba-primary-rgb))',
                      textDecoration: 'none',
                      marginRight: 14,
                      fontWeight: 600,
                    }}
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => togglePublish(t)}
                    disabled={busyId === t.id}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgb(var(--kotoba-text-rgb) / 0.2)',
                      borderRadius: 8,
                      padding: '5px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {busyId === t.id
                      ? '…'
                      : t.is_public_catalogue ? 'Unpublish' : 'Publish'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: 'rgb(var(--kotoba-text-rgb) / 0.55)' }}>
        Looking for the design-service order queue? It lives under{' '}
        <Link to="/admin/custom-themes" style={{ color: 'rgb(var(--kotoba-primary-rgb))' }}>
          /admin/custom-themes
        </Link>.
      </p>
    </div>
  );
};

export default AdminCustomThemesV2List;
