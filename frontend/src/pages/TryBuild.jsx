import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Soba from '../components/demo/Soba';
import { useAuth } from '../context/AuthContext';
import { useDemo } from '../context/DemoContext';
import { tutorSiteUrl } from '../hooks/useTenant';
import { useReveal } from '../hooks/landingAnimations';
import { getErrorMessage } from '../utils/errors';

// /try/tutor/build — four-step brand wizard the visitor goes through
// after entering the demo. Each step writes back to the demo tutor's
// record via the same PATCH /tutor/me endpoint real tutors use, so
// the demo experience IS the real flow (just on a seeded account).
//
// Steps:
//   1. Pick a theme (visual swatches)
//   2. Bio + photo
//   3. Languages + display name
//   4. Live preview of the resulting public site, with a continue CTA
//
// Skip is always available — visitors who don't care about brand-building
// can jump straight to the dashboard at any time.

const STEPS = [
  { key: 'theme', label: 'Theme' },
  { key: 'bio', label: 'Bio + photo' },
  { key: 'identity', label: 'Languages + name' },
  { key: 'preview', label: 'Preview' },
];

const TryBuild = () => {
  const navigate = useNavigate();
  const { token, currentUser } = useAuth();
  const { isDemo, loading: demoLoading, refresh: refreshDemo } = useDemo();

  const [step, setStep] = useState(0);
  const [tutor, setTutor] = useState(null);
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Field state — staged locally so the wizard feels snappy. Each step's
  // "next" button PATCHes the relevant slice to the API, then advances.
  const [themeKey, setThemeKey] = useState('sage');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [languages, setLanguages] = useState('');

  const fileInputRef = useRef(null);
  const [readyRef, readyVisible] = useReveal();

  // Bounce away if we're not in a demo session — this page only makes
  // sense as the post-/try/tutor build flow.
  useEffect(() => {
    if (demoLoading) return;
    if (!token) {
      navigate('/try/tutor', { replace: true });
      return;
    }
    // Allow real tutors here too — the wizard works either way — but
    // the typical entry is via the demo.
    if (!isDemo && currentUser?.role !== 'tutor') {
      navigate('/', { replace: true });
    }
  }, [token, isDemo, demoLoading, currentUser, navigate]);

  // Initial load: tutor + themes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tutorRes, themesRes] = await Promise.all([
          client.get('/tutor/me'),
          client.get('/tutor/themes'),
        ]);
        if (cancelled) return;
        const t = tutorRes.data || null;
        setTutor(t);
        setThemes(themesRes.data || []);
        if (t) {
          setThemeKey(t.theme || 'sage');
          setBio(t.bio || '');
          setPhotoUrl(t.photo_url || null);
          setDisplayName(t.display_name || '');
          setLanguages(t.languages_taught || '');
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load your demo workspace."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const tutorSlug = tutor?.tutor_slug;
  const previewUrl = useMemo(
    () => (tutorSlug ? tutorSiteUrl(tutorSlug, '/') : null),
    [tutorSlug],
  );

  // Stock themes are gated to Pro+ for real tutors but the demo grants
  // Pro automatically, so we show every theme in the wizard.
  const stockThemes = useMemo(
    () => themes.filter((t) => !t.custom),
    [themes],
  );

  const patchTutor = async (patch) => {
    setBusy(true);
    setError('');
    try {
      const res = await client.patch('/tutor/me', patch);
      setTutor(res.data || tutor);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that change."));
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    try {
      if (step === 0) {
        if (themeKey && themeKey !== tutor?.theme) {
          await patchTutor({ theme: themeKey });
        }
      } else if (step === 1) {
        if (bio !== (tutor?.bio || '')) {
          await patchTutor({ bio });
        }
      } else if (step === 2) {
        const patch = {};
        if (displayName !== (tutor?.display_name || '')) {
          patch.display_name = displayName;
        }
        if (languages !== (tutor?.languages_taught || '')) {
          patch.languages_taught = languages;
        }
        if (Object.keys(patch).length > 0) {
          await patchTutor(patch);
        }
        // Refresh demo context so the demo bar reflects updated display name.
        refreshDemo?.();
      }
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
    } catch {
      // Error already surfaced — stay on the current step so they can retry.
    }
  };

  const uploadPhoto = async (event) => {
    const file = event.target?.files?.[0];
    if (event.target) event.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await client.post('/users/me/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data?.photo_url;
      if (url) {
        setPhotoUrl(url);
        // The avatar endpoint already wrote photo_url onto the user row,
        // which the tutor read flattens onto tutor.photo_url. Re-fetch
        // to pick up the canonical value rather than fight the merge.
        try {
          const tutorRes = await client.get('/tutor/me');
          setTutor(tutorRes.data || tutor);
        } catch { /* best-effort refresh */ }
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't upload that photo."));
    } finally {
      setPhotoBusy(false);
    }
  };

  const skipToDashboard = () => {
    if (previewUrl) {
      // The dashboard lives at the tutor subdomain.
      window.location.assign(previewUrl + 'dashboard');
    } else {
      navigate('/', { replace: true });
    }
  };

  const finish = () => {
    if (previewUrl) {
      window.location.assign(previewUrl + 'dashboard');
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <main className="font-sans bg-kotoba-background min-h-screen text-kotoba-text relative isolate">
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
        <div
          className="v2-mesh-blob"
          style={{
            top: '-15%',
            left: '-10%',
            width: '50%',
            height: '60%',
            background: 'radial-gradient(circle, rgba(214,164,47,0.18), transparent 70%)',
          }}
        />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div
          ref={readyRef}
          className={`v2-reveal ${readyVisible ? 'is-revealed' : ''}`}
        >
          <Header step={step} />

          {loading ? (
            <div className="mt-10 text-center text-kotoba-text/60">Loading your demo workspace…</div>
          ) : (
            <div className="mt-8 bg-white rounded-3xl shadow-soft p-6 sm:p-10">
              {step === 0 && (
                <ThemeStep
                  themes={stockThemes}
                  selected={themeKey}
                  onSelect={setThemeKey}
                />
              )}
              {step === 1 && (
                <BioStep
                  bio={bio}
                  onBioChange={setBio}
                  photoUrl={photoUrl}
                  photoBusy={photoBusy}
                  onPickPhoto={() => fileInputRef.current?.click()}
                />
              )}
              {step === 2 && (
                <IdentityStep
                  displayName={displayName}
                  onDisplayNameChange={setDisplayName}
                  languages={languages}
                  onLanguagesChange={setLanguages}
                />
              )}
              {step === 3 && (
                <PreviewStep previewUrl={previewUrl} />
              )}

              {error && (
                <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-2xl text-sm">
                  {error}
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 pt-6 border-t border-kotoba-text/[0.08]">
                <button
                  type="button"
                  onClick={skipToDashboard}
                  className="text-sm font-medium text-kotoba-text/60 hover:text-kotoba-text/85"
                >
                  Skip to dashboard
                </button>
                <div className="flex items-center gap-3">
                  {step > 0 && step < STEPS.length - 1 && (
                    <button
                      type="button"
                      onClick={() => setStep((s) => Math.max(0, s - 1))}
                      className="px-4 py-2 rounded-2xl border border-kotoba-text/15 text-kotoba-text/85 font-medium hover:bg-kotoba-background/60"
                    >
                      Back
                    </button>
                  )}
                  {step < STEPS.length - 1 ? (
                    <button
                      type="button"
                      onClick={advance}
                      disabled={busy}
                      className="px-5 py-2.5 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-200 ease-soft disabled:opacity-50"
                    >
                      {busy ? 'Saving…' : 'Continue'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={finish}
                      className="px-5 py-2.5 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-200 ease-soft"
                    >
                      Open my dashboard →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={uploadPhoto}
      />
    </main>
  );
};

const Header = ({ step }) => (
  <header className="flex items-center gap-5">
    <div className="flex-shrink-0">
      <Soba size={72} variant="bob" />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
        Build your brand
      </p>
      <h1 className="mt-1 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
        {STEPS[step].label}
      </h1>
      <StepBar step={step} />
    </div>
  </header>
);

const StepBar = ({ step }) => (
  <ol className="mt-4 flex items-center gap-2 text-[11px] font-medium">
    {STEPS.map((s, i) => (
      <li
        key={s.key}
        className={`flex items-center gap-2 ${
          i === step ? 'text-kotoba-primary' : i < step ? 'text-kotoba-text/55' : 'text-kotoba-text/35'
        }`}
      >
        <span
          className={`h-1.5 w-7 rounded-full ${
            i <= step ? 'bg-kotoba-primary' : 'bg-kotoba-text/15'
          }`}
        />
        <span className="hidden sm:inline">{s.label}</span>
      </li>
    ))}
  </ol>
);

const ThemeStep = ({ themes, selected, onSelect }) => (
  <div>
    <p className="text-base text-kotoba-text/75 leading-relaxed mb-6">
      Pick the look your site starts with. You can change it any time from
      the dashboard.
    </p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {themes.map((t) => {
        const active = selected === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            className={`group text-left rounded-3xl p-5 border-2 transition-all duration-200 ease-soft ${
              active
                ? 'border-kotoba-primary shadow-soft-lg bg-kotoba-primary/[0.03]'
                : 'border-kotoba-text/10 hover:border-kotoba-primary/40 bg-white shadow-soft hover:shadow-soft-lg'
            }`}
            aria-pressed={active}
          >
            <div className={`theme-${t.key} flex h-12 rounded-2xl overflow-hidden border border-kotoba-text/10 mb-4`}>
              <div className="flex-1 bg-kotoba-primary" />
              <div className="flex-1 bg-kotoba-secondary" />
              <div className="flex-1 bg-kotoba-background" />
              <div className="flex-1 bg-kotoba-accent" />
            </div>
            <h3 className="font-display text-base font-semibold text-kotoba-text">
              {t.label || t.key}
            </h3>
            {t.tagline && (
              <p className="text-xs text-kotoba-text/60 mt-1">{t.tagline}</p>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

const BioStep = ({ bio, onBioChange, photoUrl, photoBusy, onPickPhoto }) => (
  <div className="grid gap-8 md:grid-cols-[180px_1fr]">
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55 mb-3">
        Photo
      </p>
      <button
        type="button"
        onClick={onPickPhoto}
        disabled={photoBusy}
        className="group block w-40 h-40 rounded-3xl overflow-hidden bg-kotoba-background/60 border-2 border-dashed border-kotoba-text/20 hover:border-kotoba-primary/40 transition-colors relative"
      >
        {photoUrl ? (
          <img src={photoUrl} alt="Your portrait" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-kotoba-text/50 text-sm">
            <span className="text-3xl mb-1">+</span>
            <span>Upload</span>
          </div>
        )}
        {photoBusy && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-sm text-kotoba-text/70">
            Uploading…
          </div>
        )}
      </button>
      <p className="text-xs text-kotoba-text/55 mt-2 leading-relaxed">
        JPG, PNG, or WebP up to 8 MB. Looks best at 1:1 portrait crop.
      </p>
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55 mb-3">
        Bio
      </p>
      <textarea
        value={bio}
        onChange={(e) => onBioChange(e.target.value)}
        rows={6}
        placeholder="One paragraph about your approach. Who do you teach? What feels different about your lessons?"
        className="w-full px-4 py-3 border border-kotoba-text/15 rounded-2xl text-base leading-relaxed focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
      />
      <p className="text-xs text-kotoba-text/55 mt-2">
        Don't overthink it — you can rewrite this any time on your About page.
      </p>
    </div>
  </div>
);

const IdentityStep = ({ displayName, onDisplayNameChange, languages, onLanguagesChange }) => (
  <div className="grid gap-6 max-w-xl">
    <div>
      <label className="block text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55 mb-2">
        Display name
      </label>
      <input
        type="text"
        value={displayName}
        onChange={(e) => onDisplayNameChange(e.target.value)}
        placeholder="e.g. Vasso · Greek with Vasso"
        className="w-full px-4 py-3 border border-kotoba-text/15 rounded-2xl text-base focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
      />
      <p className="text-xs text-kotoba-text/55 mt-2">
        What students see at the top of your site. Your real name, your brand name, your call.
      </p>
    </div>
    <div>
      <label className="block text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/55 mb-2">
        Languages you teach
      </label>
      <input
        type="text"
        value={languages}
        onChange={(e) => onLanguagesChange(e.target.value)}
        placeholder="Greek, English"
        className="w-full px-4 py-3 border border-kotoba-text/15 rounded-2xl text-base focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
      />
      <p className="text-xs text-kotoba-text/55 mt-2">
        Comma-separated — used by Discover to surface you to the right students.
      </p>
    </div>
  </div>
);

const PreviewStep = ({ previewUrl }) => (
  <div>
    <p className="text-base text-kotoba-text/75 leading-relaxed mb-5">
      Here's your site, live. Open the dashboard when you're ready to dig
      into lesson packs, articles, and the page builder.
    </p>
    {previewUrl ? (
      <div className="rounded-3xl overflow-hidden border border-kotoba-text/10 shadow-soft-lg bg-kotoba-background/30 h-[70vh]">
        <iframe
          src={previewUrl}
          title="Your tutor site"
          className="w-full h-full"
        />
      </div>
    ) : (
      <div className="text-kotoba-text/60 italic">
        Your site URL will appear in the dashboard once your workspace is ready.
      </div>
    )}
    {previewUrl && (
      <p className="text-xs text-kotoba-text/55 mt-3">
        Open in a new tab:{' '}
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-kotoba-primary hover:underline"
        >
          {previewUrl}
        </a>
      </p>
    )}
  </div>
);

export default TryBuild;
