/**
 * Animation hooks used by the modernised landing page.
 *
 * All three are tiny + dependency-free so the landing chunk stays
 * small. Browser support assumes IntersectionObserver + rAF, both of
 * which are universal on every device we care about.
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Returns a ref + a "has been visible" boolean. The boolean flips to
 * true the first time the element enters the viewport, then sticks —
 * so fade-up animations don't re-trigger when the user scrolls back.
 */
export function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            return;
          }
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, visible]);
  return [ref, visible];
}

/**
 * Animates a number from 0 → target over `duration` ms once the
 * returned ref enters the viewport. Returns [ref, currentValue].
 *
 * Honours prefers-reduced-motion — those users get the final value
 * instantly.
 */
export function useCountUp(target, duration = 1400) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(target);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setValue(target);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const start = performance.now();
          const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            // Ease-out cubic — fast start, settle at the end.
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(Math.round(target * eased));
            if (t < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          io.disconnect();
          return;
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, duration]);
  return [ref, value];
}

/**
 * Tracks how long the visitor has been on the page (since the hook
 * mounted) and how far they've scrolled (0..100 % of available scroll
 * distance). Returns a getter — call `read()` at the moment you need
 * the current values, e.g. inside an event handler.
 *
 * Used by the article reader for read-tracking, comments, and
 * ratings — all three share the same dwell + scroll thresholds and
 * we want them to read live values rather than stale closure snapshots.
 */
export function useDwellScroll() {
  const startedAtRef = useRef(typeof window === 'undefined' ? 0 : Date.now());
  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);
  return () => {
    if (typeof window === 'undefined') {
      return { dwellSeconds: 0, scrollPercent: 0 };
    }
    const dwellSeconds = Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000);
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const scrollPercent =
      max <= 0
        ? 100
        : Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100)));
    return { dwellSeconds, scrollPercent };
  };
}

/**
 * Updates two CSS custom properties (--spot-x, --spot-y) on the
 * returned ref as the pointer moves over it. Pair with a radial
 * gradient that reads those vars to get a "spotlight follows the
 * cursor" hover effect.
 */
export function useSpotlight() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = (e) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      el.style.setProperty('--spot-x', `${x}%`);
      el.style.setProperty('--spot-y', `${y}%`);
    };
    const leave = () => {
      el.style.setProperty('--spot-x', `50%`);
      el.style.setProperty('--spot-y', `-30%`);
    };
    el.addEventListener('pointermove', handle);
    el.addEventListener('pointerleave', leave);
    leave();
    return () => {
      el.removeEventListener('pointermove', handle);
      el.removeEventListener('pointerleave', leave);
    };
  }, []);
  return ref;
}
