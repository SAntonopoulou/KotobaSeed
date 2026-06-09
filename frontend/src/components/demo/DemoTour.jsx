import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDemo } from '../../context/DemoContext';
import { tourByRole } from '../../data/tourScripts';
import Soba from './Soba';

// Mascot-led tour engine.
//
// Lives at the top of the persistent root layout so the mascot visibly
// travels between pages as the tour drives navigation. A CSS transform
// transition on Soba's wrapper makes a route change look like a soft
// glide to the next spotlight.
//
// Cross-cutting rules:
//  - Auto-starts ONCE per browser per demo session, gated by
//    localStorage('koto_demo_tour_done'). The Restart button in the
//    DemoBar clears that flag and dispatches a window event we listen
//    to here.
//  - Never auto-runs under navigator.webdriver — keeps E2E sane.
//  - prefers-reduced-motion: mascot doesn't bob/glide, bubble snaps.
//  - The user wandering off-route gracefully ends the tour (we track
//    engine-driven vs user nav with `pendingRoute`).
//  - Selector targets resolve with a short retry window so the engine
//    can navigate to a route and then wait for its DOM to mount.

const TARGET_RETRY_MS = 80;
const TARGET_TIMEOUT_MS = 3000;
const BUBBLE_GAP = 14;
const STORAGE_KEY = 'koto_demo_tour_done';

const isAutomation = () =>
  typeof navigator !== 'undefined' &&
  (navigator.webdriver || /HeadlessChrome|Playwright/i.test(navigator.userAgent || ''));

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const DemoTour = () => {
  const { isDemo, demoRole, loading } = useDemo();
  const navigate = useNavigate();
  const location = useLocation();

  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [target, setTarget] = useState(null); // { rect } or null for stepless
  // For `interactive: true` steps, the engine listens for an input event on
  // the resolved target and only unlocks Next once the user has typed.
  const [interactiveSatisfied, setInteractiveSatisfied] = useState(false);
  const pendingRouteRef = useRef(null);
  const shownAtLeastOnceRef = useRef(false);
  const resolveTimerRef = useRef(null);

  const script = tourByRole[demoRole] || [];
  const step = active ? script[stepIdx] : null;

  // --- Lifecycle: auto-start once per demo session -------------------

  const start = useCallback(() => {
    if (!script.length || isAutomation()) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    pendingRouteRef.current = null;
    shownAtLeastOnceRef.current = false;
    setStepIdx(0);
    setActive(true);
  }, [script]);

  const end = useCallback(({ markDone = true } = {}) => {
    setActive(false);
    setTarget(null);
    pendingRouteRef.current = null;
    if (markDone) {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    }
    if (resolveTimerRef.current) {
      clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }
  }, []);

  // Auto-start on first paint of a demo session, gated by localStorage.
  useEffect(() => {
    if (loading || !isDemo) return;
    if (!script.length) return;
    if (isAutomation()) return;
    let alreadyDone = false;
    try { alreadyDone = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* ignore */ }
    if (alreadyDone) return;
    // Wait a tick so the dashboard has mounted before we look for selectors.
    const t = setTimeout(start, 600);
    return () => clearTimeout(t);
  }, [loading, isDemo, script, start]);

  // Restart-tour event from the DemoBar.
  useEffect(() => {
    const onRestart = () => start();
    window.addEventListener('koto:demo-tour-restart', onRestart);
    return () => window.removeEventListener('koto:demo-tour-restart', onRestart);
  }, [start]);

  // --- Per-step orchestration ----------------------------------------
  //
  // When stepIdx changes (or when the route catches up to an
  // engine-driven nav), navigate if needed, then resolve the target.

  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;

    setInteractiveSatisfied(false);

    const resolveRoute = async () => {
      if (typeof step.route === 'function') {
        try {
          return await step.route();
        } catch {
          return null;
        }
      }
      return step.route;
    };

    (async () => {
      const targetRoute = await resolveRoute();
      if (cancelled) return;
      if (!targetRoute) {
        // Resolver bailed — skip this step.
        next();
        return;
      }

      // Route mismatch — engine drives navigation.
      if (location.pathname !== targetRoute) {
        pendingRouteRef.current = targetRoute;
        navigate(targetRoute);
        return;
      }
      // We're on the right route. Clear the engine-driven flag.
      pendingRouteRef.current = null;

      // Resolve target (or skip if stepless).
      setTarget(null);
      if (!step.targetSelector) {
        shownAtLeastOnceRef.current = true;
        return;
      }

      const deadline = Date.now() + TARGET_TIMEOUT_MS;
      const tick = () => {
        if (cancelled) return;
        const el = document.querySelector(step.targetSelector);
        if (el) {
          const rect = el.getBoundingClientRect();
          setTarget({ rect, el });
          shownAtLeastOnceRef.current = true;
          return;
        }
        if (Date.now() >= deadline) {
          // Couldn't find the target — skip the step, advance.
          next();
          return;
        }
        resolveTimerRef.current = setTimeout(tick, TARGET_RETRY_MS);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      if (resolveTimerRef.current) {
        clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx, location.pathname]);

  // Interactive gate: when `step.interactive` is true and we've resolved a
  // target, attach an `input` listener; the first change unlocks Next.
  useEffect(() => {
    if (!active || !step || !step.interactive || !target?.el) return;
    const el = target.el;
    const onInput = () => setInteractiveSatisfied(true);
    el.addEventListener('input', onInput);
    return () => el.removeEventListener('input', onInput);
  }, [active, step, target]);

  // Recompute target rect on resize/scroll so the bubble stays glued.
  useEffect(() => {
    if (!active || !step || !step.targetSelector) return;
    const recompute = () => {
      const el = document.querySelector(step.targetSelector);
      if (el) setTarget({ rect: el.getBoundingClientRect(), el });
    };
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [active, step]);

  // User-wander detector — if the route changes to something not in
  // the script and we didn't drive it, end gracefully (don't yank
  // them back). Only compares against string `route`s; function-resolved
  // routes are treated as "engine-only" via the pendingRoute ref.
  useEffect(() => {
    if (!active) return;
    if (!shownAtLeastOnceRef.current) return;
    if (pendingRouteRef.current === location.pathname) return;
    if (step && typeof step.route === 'string' && location.pathname === step.route) return;
    end({ markDone: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // --- Step navigation -----------------------------------------------

  const next = useCallback(() => {
    setStepIdx((i) => {
      if (i + 1 >= script.length) {
        // Last step — end normally.
        setTimeout(() => end({ markDone: true }), 0);
        return i;
      }
      return i + 1;
    });
  }, [script.length, end]);

  const back = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  const skip = useCallback(() => end({ markDone: true }), [end]);

  if (!active || !step) return null;

  // --- Render --------------------------------------------------------

  const reduce = reducedMotion();
  const total = script.length;
  const idx = stepIdx + 1;

  // Position computations.
  // - Stepless: center the bubble + mascot on the viewport, dim with scrim.
  // - Spotlight: bubble below the target (or above if no room),
  //   mascot to the right of the bubble.
  const isStepless = !step.targetSelector || !target;

  let bubbleStyle = {};
  let mascotStyle = {};

  if (isStepless) {
    bubbleStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
    mascotStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(120%, -50%)',
    };
  } else {
    const r = target.rect;
    const spaceBelow = window.innerHeight - r.bottom;
    const placeBelow = spaceBelow > 200;
    const bubbleTop = placeBelow ? r.bottom + BUBBLE_GAP : r.top - 220;
    const bubbleLeft = Math.max(16, Math.min(window.innerWidth - 360, r.left));
    bubbleStyle = { top: bubbleTop, left: bubbleLeft, transform: 'none' };
    mascotStyle = {
      top: bubbleTop - 56,
      left: bubbleLeft + 280,
      transform: 'none',
    };
  }

  return (
    <div className="font-sans">
      {/* Scrim for stepless steps */}
      {isStepless && (
        <div
          className="fixed inset-0 z-[80] bg-kotoba-text/40 backdrop-blur-sm pointer-events-auto"
          onClick={skip}
          aria-label="Dismiss tour"
        />
      )}

      {/* Spotlight ring around the target */}
      {!isStepless && target && (
        <div
          className="fixed z-[80] pointer-events-none rounded-2xl ring-4 ring-kotoba-secondary/80 ring-offset-2 ring-offset-kotoba-background/0"
          style={{
            top: target.rect.top - 6,
            left: target.rect.left - 6,
            width: target.rect.width + 12,
            height: target.rect.height + 12,
            transition: reduce ? 'none' : 'all 380ms cubic-bezier(0.22, 1, 0.36, 1)',
            boxShadow: '0 0 0 9999px rgba(43,70,60,0.40)',
            borderRadius: '14px',
          }}
        />
      )}

      {/* Mascot */}
      <div
        className="fixed z-[90] pointer-events-none"
        style={{
          ...mascotStyle,
          transition: reduce ? 'none' : 'top 600ms cubic-bezier(0.22, 1, 0.36, 1), left 600ms cubic-bezier(0.22, 1, 0.36, 1), transform 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <Soba size={80} variant={reduce ? 'none' : 'bob'} />
      </div>

      {/* Bubble */}
      <div
        role="dialog"
        aria-live="polite"
        className="fixed z-[90] bg-white rounded-3xl shadow-soft-lg p-5 max-w-[320px] sm:max-w-[360px]"
        style={{
          ...bubbleStyle,
          transition: reduce ? 'none' : 'top 600ms cubic-bezier(0.22, 1, 0.36, 1), left 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
            Step {idx} of {total}
          </span>
          {step.badge && (
            <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-kotoba-primary bg-kotoba-primary/10 px-2 py-0.5 rounded">
              {step.badge}
            </span>
          )}
        </div>
        <h3 className="font-display text-lg font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
          {step.title}
        </h3>
        <p className="mt-2 text-sm text-kotoba-text/80 leading-relaxed">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={skip}
            className="text-xs font-semibold text-kotoba-text/55 hover:text-kotoba-text px-2 py-1"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={back}
                className="text-xs font-semibold text-kotoba-primary hover:bg-kotoba-primary/5 px-3 py-1.5 rounded-xl border border-kotoba-primary/20"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={step.interactive && !interactiveSatisfied}
              className="group text-xs font-semibold text-white bg-kotoba-primary hover:bg-kotoba-primary/90 px-3 py-1.5 rounded-xl shadow-soft hover:shadow-soft-lg transition-all disabled:bg-kotoba-primary/40 disabled:cursor-not-allowed disabled:hover:shadow-soft"
            >
              {step.interactive && !interactiveSatisfied
                ? 'Try it'
                : stepIdx + 1 >= total
                ? 'Done'
                : 'Next'}
              <span
                className="ml-1 transition-transform duration-300 inline-block group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                →
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoTour;
