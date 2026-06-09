import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { SkeletonCard } from '../components/Skeleton';
import {
  MODULES,
  MODULE_COUNT,
  moduleByKey,
  nextModule,
  previousModule,
} from '../onboarding/modules';
import { getErrorMessage } from '../utils/errors';

// /onboarding/tutor — the resumable walkthrough.
//
// Layout: left sidebar lists every module with a check mark for ones the
// tutor has completed and a highlight on the current one. Right side
// shows the active module's content + actions. Progress is persisted to
// the backend so the tutor can close the tab and come back any time.

const TutorOnboardingWizard = () => {
  const { moduleKey } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { addToast } = useToast();

  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/onboarding/progress');
      setProgress(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your onboarding progress.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Resolve which module to show:
  //   1. URL param wins
  //   2. else last_viewed_module_key from backend ("continue where left off")
  //   3. else first module
  const activeKey = useMemo(() => {
    if (moduleKey && moduleByKey(moduleKey)) return moduleKey;
    if (progress?.last_viewed_module_key && moduleByKey(progress.last_viewed_module_key)) {
      return progress.last_viewed_module_key;
    }
    return MODULES[0].key;
  }, [moduleKey, progress]);

  const active = moduleByKey(activeKey);
  const completedSet = useMemo(
    () => new Set(progress?.completed_module_keys || []),
    [progress],
  );
  const doneCount = completedSet.size;
  const isDone = active ? completedSet.has(active.key) : false;
  const next = active ? nextModule(active.key) : null;
  const prev = active ? previousModule(active.key) : null;

  // Stamp "view" when the user navigates to a new module so resume works.
  useEffect(() => {
    if (!active || loading) return;
    if (progress?.last_viewed_module_key === active.key) return;
    (async () => {
      try {
        const res = await client.post('/tutor/onboarding/progress', {
          action: 'view',
          module_key: active.key,
        });
        setProgress(res.data);
      } catch {
        /* best-effort; failing to stamp view doesn't break the page */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key, loading]);

  const markComplete = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const res = await client.post(
        `/tutor/onboarding/progress?total_modules=${MODULE_COUNT}`,
        { action: 'complete', module_key: active.key },
      );
      setProgress(res.data);
      addToast({ message: `${active.title} — done.`, type: 'success' });
      if (next) {
        navigate(`/onboarding/tutor/${next.key}`);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save progress.'));
    } finally {
      setSaving(false);
    }
  };

  const restart = async () => {
    if (
      !(await confirm({
        title: 'Restart onboarding',
        message:
          "Reset your tutorial progress and start from the beginning? This won't change anything on your live site — just the tutorial state.",
        confirmText: 'Restart',
      }))
    )
      return;
    setSaving(true);
    try {
      const res = await client.post('/tutor/onboarding/progress', {
        action: 'restart',
      });
      setProgress(res.data);
      navigate(`/onboarding/tutor/${MODULES[0].key}`);
      addToast({ message: 'Tutorial reset. Back to the start.', type: 'success' });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not restart.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <SkeletonCard />
      </div>
    );
  }
  if (!active) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <p className="text-sm text-kotoba-text/70">Module not found.</p>
      </div>
    );
  }

  const percent = Math.round((doneCount / MODULE_COUNT) * 100);

  return (
    <div className="bg-kotoba-background/30 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60">
              Tutor onboarding
            </p>
            <h1 className="mt-1 text-3xl font-bold text-kotoba-primary">
              Get set up to teach
            </h1>
            <p className="mt-1 text-sm text-kotoba-text/70">
              Twelve short modules. You can leave and come back any time — we'll drop
              you right where you stopped.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="text-sm text-kotoba-text/70 hover:text-kotoba-primary"
          >
            ← Back to dashboard
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm mb-4">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-[18rem_1fr] gap-6">
          {/* Sidebar */}
          <aside className="bg-white rounded-2xl shadow-sm p-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs font-medium text-kotoba-text/60 mb-1">
                <span>Progress</span>
                <span>
                  {doneCount} / {MODULE_COUNT}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-kotoba-background overflow-hidden">
                <div
                  className="h-full bg-kotoba-primary transition-all duration-500"
                  style={{ width: `${Math.max(2, percent)}%` }}
                />
              </div>
            </div>
            <ol className="space-y-1">
              {MODULES.map((m, idx) => {
                const isActive = m.key === active.key;
                const done = completedSet.has(m.key);
                return (
                  <li key={m.key}>
                    <Link
                      to={`/onboarding/tutor/${m.key}`}
                      className={`flex items-start gap-2 px-3 py-2 rounded-md text-sm leading-snug ${
                        isActive
                          ? 'bg-kotoba-primary/10 text-kotoba-primary font-semibold'
                          : 'text-kotoba-text/80 hover:bg-kotoba-background/60'
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          done
                            ? 'bg-kotoba-primary text-white'
                            : isActive
                            ? 'bg-kotoba-primary/20 text-kotoba-primary'
                            : 'bg-kotoba-text/10 text-kotoba-text/60'
                        }`}
                      >
                        {done ? '✓' : idx + 1}
                      </span>
                      <span className="min-w-0">{m.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
            <div className="border-t border-kotoba-text/10 mt-4 pt-3">
              <button
                type="button"
                onClick={restart}
                disabled={saving}
                className="text-xs text-kotoba-text/60 hover:text-red-600 disabled:opacity-50"
              >
                Restart from the beginning
              </button>
            </div>
          </aside>

          {/* Content */}
          <article className="bg-white rounded-2xl shadow-sm p-6 sm:p-8 space-y-5">
            <header>
              <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60">
                Module {MODULES.findIndex((m) => m.key === active.key) + 1} of {MODULE_COUNT}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-kotoba-primary">
                {active.title}
              </h2>
              {active.summary && (
                <p className="mt-1 text-sm text-kotoba-text/70">{active.summary}</p>
              )}
            </header>

            <div className="space-y-5">
              {active.sections.map((s, idx) => (
                <section key={idx}>
                  <h3 className="text-base font-semibold text-kotoba-text">{s.heading}</h3>
                  <p className="mt-1 text-sm text-kotoba-text leading-relaxed whitespace-pre-line">
                    {s.body}
                  </p>
                </section>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-4 border-t border-kotoba-text/10">
              <div className="flex items-center gap-2">
                {prev && (
                  <Link
                    to={`/onboarding/tutor/${prev.key}`}
                    className="text-sm text-kotoba-text/70 hover:text-kotoba-primary"
                  >
                    ← {prev.title}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {active.tryIt && (
                  <Link
                    to={active.tryIt.path}
                    className="px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary text-sm font-semibold hover:bg-kotoba-primary hover:text-white"
                  >
                    {active.tryIt.label} →
                  </Link>
                )}
                {!isDone && (
                  <button
                    type="button"
                    onClick={markComplete}
                    disabled={saving}
                    className="px-5 py-2 rounded-md bg-kotoba-primary text-white text-sm font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : next ? 'Mark complete & continue' : 'Mark complete'}
                  </button>
                )}
                {isDone && next && (
                  <Link
                    to={`/onboarding/tutor/${next.key}`}
                    className="px-5 py-2 rounded-md bg-kotoba-primary text-white text-sm font-semibold hover:bg-kotoba-primary/90"
                  >
                    Next: {next.title} →
                  </Link>
                )}
                {isDone && !next && (
                  <Link
                    to="/dashboard"
                    className="px-5 py-2 rounded-md bg-kotoba-primary text-white text-sm font-semibold hover:bg-kotoba-primary/90"
                  >
                    Finish & go to dashboard →
                  </Link>
                )}
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
};

export default TutorOnboardingWizard;
