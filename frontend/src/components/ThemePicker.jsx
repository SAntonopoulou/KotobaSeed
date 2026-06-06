import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Pro+ feature. We render the picker for everyone so free tutors can see
// what they'd unlock; save calls 402 for non-Pro and we show the upgrade
// prompt.

// Tiny swatch row that previews a theme's primary, secondary, background
// without us having to hardcode hex anywhere — we just render a div with
// the matching theme- class and pull from CSS vars.
const ThemeSwatch = ({ themeKey }) => (
  <div className={`theme-${themeKey} flex h-10 rounded-md overflow-hidden border border-kotoba-text/15`}>
    <div className="flex-1 bg-kotoba-primary" />
    <div className="flex-1 bg-kotoba-secondary" />
    <div className="flex-1 bg-kotoba-background" />
    <div className="flex-1 bg-kotoba-accent" />
  </div>
);

const ThemePicker = ({ tutor, onSaved }) => {
  const [themes, setThemes] = useState([]);
  const [tier, setTier] = useState(null);
  const [selected, setSelected] = useState(tutor?.theme || 'sage');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isPro = tier === 'pro' || tier === 'business';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [themesRes, meRes] = await Promise.all([
          client.get('/tutor/themes'),
          client.get('/users/me').catch(() => ({ data: null })),
        ]);
        if (!cancelled) {
          setThemes(themesRes.data || []);
          setTier(meRes.data?.subscription_tier || 'free');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || 'Could not load themes.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelected(tutor?.theme || 'sage');
  }, [tutor?.theme]);

  const save = async () => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const res = await client.patch('/tutor/me', { theme: selected });
      setInfo('Theme applied. Visit your site to see it live.');
      onSaved?.(res.data);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 402) {
        setError('Themes are a Pro feature. Upgrade your plan to switch from Sage.');
      } else {
        setError(err?.response?.data?.detail || 'Could not save the theme.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Theme</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  const dirty = selected !== (tutor?.theme || 'sage');

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Theme</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Pick a colour palette for your public site. Themes apply across hero, buttons, headings, and accents — your content stays the same.
          </p>
        </div>
        {!isPro && (
          <span className="px-3 py-1 rounded-md bg-kotoba-secondary/30 text-kotoba-text text-sm font-medium">
            Pro feature
          </span>
        )}
      </div>

      {!isPro && (
        <div className="bg-kotoba-secondary/15 text-kotoba-text border border-kotoba-secondary/40 px-4 py-3 rounded-md text-sm">
          Preview any theme below. Switching requires a Pro plan — Sage stays your default.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm">
          {info}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {themes.map((theme) => {
          const active = selected === theme.key;
          return (
            <button
              key={theme.key}
              type="button"
              onClick={() => setSelected(theme.key)}
              className={`text-left p-4 rounded-xl border-2 transition-colors ${
                active
                  ? 'border-kotoba-primary bg-kotoba-primary/5'
                  : 'border-kotoba-text/10 hover:border-kotoba-primary/40'
              }`}
            >
              <ThemeSwatch themeKey={theme.key} />
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="font-semibold text-kotoba-primary">{theme.label}</p>
                {active && (
                  <span className="text-xs text-kotoba-primary">Selected</span>
                )}
              </div>
              <p className="text-xs text-kotoba-text/60 mt-1">
                {theme.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-kotoba-text/10">
        {dirty && (
          <span className="text-xs text-kotoba-text/60 mr-1">Unsaved selection</span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty || !isPro}
          className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Apply theme'}
        </button>
      </div>
    </section>
  );
};

export default ThemePicker;
