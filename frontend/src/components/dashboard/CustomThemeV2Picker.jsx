import React, { useEffect, useState } from 'react';
import client from '../../api/client';
import { getErrorMessage } from '../../utils/errors';

// CustomThemeV2Picker — tutor-side catalogue of upload-driven custom
// themes. Fetches everything the calling tutor can apply (own +
// team-owned + public catalogue) from GET /custom-themes/v2/available.
//
// Clicking "Apply" PATCHes /tutor/me with { theme: theme_key }. The
// runtime CustomThemeSite mounts on the tenant subdomain the next
// page load and renders the new theme. Reverting is one click — the
// "Use a stock theme" button drops the tutor back to `sage`.

const CustomThemeV2Picker = () => {
  const [themes, setThemes] = useState(null);
  const [currentKey, setCurrentKey] = useState(null);
  const [busy, setBusy] = useState(null);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const [themesRes, meRes] = await Promise.all([
        client.get('/custom-themes/v2/available'),
        client.get('/tutor/me'),
      ]);
      setThemes(themesRes.data || []);
      setCurrentKey(meRes.data?.theme || null);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load custom themes.'));
      setThemes([]);
    }
  };

  useEffect(() => { load(); }, []);

  const apply = async (theme) => {
    setBusy(theme.theme_key);
    setError('');
    setInfo('');
    try {
      const res = await client.patch('/tutor/me', { theme: theme.theme_key });
      setCurrentKey(res.data?.theme || theme.theme_key);
      setInfo(`Applied “${theme.name}”. Reload your tenant to see it.`);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not apply theme.'));
    } finally {
      setBusy(null);
    }
  };

  const revertToStock = async () => {
    setBusy('__revert');
    setError('');
    setInfo('');
    try {
      const res = await client.patch('/tutor/me', { theme: 'sage' });
      setCurrentKey(res.data?.theme || 'sage');
      setInfo('Reverted to the default sage theme.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not revert.'));
    } finally {
      setBusy(null);
    }
  };

  const isCustom = currentKey && currentKey.startsWith('custom-');

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <header className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex-grow">
          <h2 className="text-lg font-bold text-kotoba-primary">Custom themes</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Pick a bespoke or curated theme designed for your tenant site. Applying takes effect on your next page load.
          </p>
        </div>
        {isCustom && (
          <button
            type="button"
            onClick={revertToStock}
            disabled={busy === '__revert'}
            className="text-xs font-semibold text-kotoba-text/70 hover:text-kotoba-primary border border-kotoba-text/15 rounded-full px-3 py-1.5"
          >
            {busy === '__revert' ? 'Reverting…' : 'Use a stock theme'}
          </button>
        )}
      </header>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="mb-3 bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm">
          {info}
        </div>
      )}

      {themes === null ? (
        <p className="text-sm text-kotoba-text/60">Loading themes…</p>
      ) : themes.length === 0 ? (
        <p className="text-sm text-kotoba-text/60">
          No custom themes available yet. Curated themes from the team show up here automatically once an admin publishes one.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map((t) => {
            const isActive = t.theme_key === currentKey;
            return (
              <div
                key={t.id}
                className={
                  'rounded-2xl border overflow-hidden transition-shadow ' +
                  (isActive
                    ? 'border-kotoba-primary shadow-md'
                    : 'border-kotoba-text/10 hover:shadow-sm')
                }
              >
                {t.preview_image_url ? (
                  <img
                    src={t.preview_image_url}
                    alt={t.name}
                    className="w-full h-32 object-cover bg-kotoba-background"
                  />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center bg-kotoba-background text-kotoba-text/40 text-3xl font-display font-bold">
                    {(t.name || '?').charAt(0)}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-display text-base font-bold text-kotoba-primary leading-tight">
                      {t.name}
                    </h3>
                    {isActive && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-kotoba-primary bg-kotoba-primary/10 px-2 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-kotoba-text/55 mb-3 truncate">
                    {t.theme_key}
                  </p>
                  {t.is_public_catalogue && !isActive && (
                    <p className="text-[10px] uppercase tracking-[0.12em] text-kotoba-text/55 font-bold mb-3">
                      From catalogue
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => apply(t)}
                    disabled={isActive || busy === t.theme_key}
                    className={
                      'w-full text-xs font-semibold rounded-full px-3 py-2 transition-colors ' +
                      (isActive
                        ? 'bg-kotoba-text/8 text-kotoba-text/40 cursor-default'
                        : 'bg-kotoba-primary text-white hover:bg-kotoba-primary/90 disabled:opacity-60')
                    }
                  >
                    {busy === t.theme_key
                      ? 'Applying…'
                      : isActive
                        ? 'Applied'
                        : 'Apply this theme'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default CustomThemeV2Picker;
