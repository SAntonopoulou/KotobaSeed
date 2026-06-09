import React, { useCallback, useEffect, useRef, useState } from 'react';
import Soba from '../demo/Soba';
import tutorTourScript from './tutorTourScript';

// First-time tutor walkthrough. Modeled on `components/demo/DemoTour.jsx`
// but trimmed for the tutor dashboard surface only:
//   - Doesn't navigate routes (the dashboard is one page; we drive the
//     `#section=...` hash via the script's `onEnter` hooks).
//   - Auto-starts once per browser per tutor (localStorage gated).
//   - Restart event: `koto:tutor-tour-restart`.
//   - Skips a step quietly if its target hasn't mounted within 3s.
//   - Respects prefers-reduced-motion + skips under E2E automation.

const TARGET_RETRY_MS = 80;
const TARGET_TIMEOUT_MS = 3000;
const BUBBLE_GAP = 14;
const STORAGE_KEY = 'koto:tutor-tour-completed';

const isAutomation = () =>
  typeof navigator !== 'undefined' &&
  (navigator.webdriver || /HeadlessChrome|Playwright/i.test(navigator.userAgent || ''));

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const TutorTour = ({ autoStart = true }) => {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [target, setTarget] = useState(null);
  const shownAtLeastOnceRef = useRef(false);
  const resolveTimerRef = useRef(null);

  const script = tutorTourScript;
  const step = active ? script[stepIdx] : null;

  const start = useCallback(() => {
    if (!script.length || isAutomation()) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    shownAtLeastOnceRef.current = false;
    setStepIdx(0);
    setActive(true);
  }, [script]);

  const end = useCallback(({ markDone = true } = {}) => {
    setActive(false);
    setTarget(null);
    if (markDone) {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    }
    if (resolveTimerRef.current) {
      clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }
  }, []);

  // Auto-start on first paint, gated by localStorage.
  useEffect(() => {
    if (!autoStart || !script.length || isAutomation()) return;
    let done = false;
    try { done = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* ignore */ }
    if (done) return;
    const t = setTimeout(start, 600);
    return () => clearTimeout(t);
  }, [autoStart, script, start]);

  // Restart event from the dashboard header button.
  useEffect(() => {
    const onRestart = () => start();
    window.addEventListener('koto:tutor-tour-restart', onRestart);
    return () => window.removeEventListener('koto:tutor-tour-restart', onRestart);
  }, [start]);

  // Per-step orchestration: run onEnter (drives the section), resolve target.
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;

    if (typeof step.onEnter === 'function') {
      try { step.onEnter(); } catch { /* ignore */ }
    }

    setTarget(null);
    if (!step.targetSelector) {
      shownAtLeastOnceRef.current = true;
      return () => { cancelled = true; };
    }

    const deadline = Date.now() + TARGET_TIMEOUT_MS;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(step.targetSelector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTarget({ rect, el });
        shownAtLeastOnceRef.current = true;
        // Scroll into view so the spotlight lands on a visible target.
        try {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch { /* ignore */ }
        return;
      }
      if (Date.now() >= deadline) {
        // Couldn't find — skip silently.
        next();
        return;
      }
      resolveTimerRef.current = setTimeout(tick, TARGET_RETRY_MS);
    };
    // Small delay so React renders the section switch before we hunt.
    resolveTimerRef.current = setTimeout(tick, 200);

    return () => {
      cancelled = true;
      if (resolveTimerRef.current) {
        clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx]);

  // Recompute target rect on resize/scroll so the spotlight stays glued.
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

  // Esc to skip
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === 'Escape') end({ markDone: true }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, end]);

  const next = useCallback(() => {
    setStepIdx((i) => {
      if (i + 1 >= script.length) {
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

  const reduce = reducedMotion();
  const total = script.length;
  const idx = stepIdx + 1;
  const isStepless = !step.targetSelector || !target;

  let bubbleStyle = {};
  let mascotStyle = {};

  if (isStepless) {
    bubbleStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    mascotStyle = { top: '50%', left: '50%', transform: 'translate(120%, -50%)' };
  } else {
    const r = target.rect;
    const spaceBelow = window.innerHeight - r.bottom;
    const placeBelow = spaceBelow > 220;
    const bubbleTop = placeBelow ? r.bottom + BUBBLE_GAP : Math.max(16, r.top - 240);
    const isMobile = window.innerWidth < 640;
    const bubbleW = isMobile ? Math.min(window.innerWidth - 24, 320) : 360;
    const bubbleLeft = isMobile
      ? Math.max(12, (window.innerWidth - bubbleW) / 2)
      : Math.max(16, Math.min(window.innerWidth - bubbleW - 16, r.left));
    bubbleStyle = { top: bubbleTop, left: bubbleLeft, width: bubbleW, transform: 'none' };
    mascotStyle = {
      top: Math.max(8, bubbleTop - 56),
      left: bubbleLeft + Math.min(280, bubbleW - 80),
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

      {/* Spotlight ring */}
      {!isStepless && target && (
        <div
          className="fixed z-[80] pointer-events-none ring-4 ring-kotoba-secondary/80 ring-offset-2"
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
          transition: reduce ? 'none' : 'top 600ms cubic-bezier(0.22, 1, 0.36, 1), left 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <Soba size={80} variant={reduce ? 'none' : 'bob'} />
      </div>

      {/* Bubble */}
      <div
        role="dialog"
        aria-live="polite"
        className="fixed z-[90] bg-white rounded-3xl shadow-soft-lg p-5"
        style={{
          ...bubbleStyle,
          transition: reduce ? 'none' : 'top 600ms cubic-bezier(0.22, 1, 0.36, 1), left 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
            Step {idx} of {total}
          </span>
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
            Skip the rest
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
              className="group text-xs font-semibold text-white bg-kotoba-primary hover:bg-kotoba-primary/90 px-3 py-1.5 rounded-xl shadow-soft hover:shadow-soft-lg transition-all"
            >
              {stepIdx + 1 >= total ? 'Done' : 'Next'}
              <span className="ml-1 inline-block group-hover:translate-x-0.5 transition-transform" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorTour;
