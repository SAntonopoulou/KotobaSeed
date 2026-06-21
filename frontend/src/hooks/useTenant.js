import { useMemo } from 'react';

const RESERVED = new Set(['www', 'api', 'admin']);

// The apex domain is baked in at build time so the same source tree
// boots correctly on prod (`kotobaseed.net`), staging
// (`demo.kotobaseed.net`), and dev (`localhost`). Without this, the
// staging build mis-resolves its own apex as `slug=demo` and tries
// to render a non-existent tutor site.
const PLATFORM_APEX = (import.meta.env.VITE_PLATFORM_APEX || 'kotobaseed.net').toLowerCase();

const APEX_HOSTS = new Set([
  PLATFORM_APEX,
  'localhost',
  '127.0.0.1',
]);

// Reserved leading segments that should be treated as env-level apexes
// rather than tutor slugs. The same build runs on prod
// (kotobaseed.net) and demo (demo.kotobaseed.net); without this set,
// the demo build would resolve its own host as slug='demo' and the
// tutorSiteUrl helper would point demo's tutor links at the prod
// subdomain (akiko.kotobaseed.net) instead of staying on demo
// (akiko.demo.kotobaseed.net). Add 'staging' if/when we split that out.
const ENV_APEX_SEGMENTS = new Set(['demo', 'staging']);

const APEX_SUFFIX = `.${PLATFORM_APEX}`;
const DEV_SUFFIX = '.localhost';

/**
 * Read the current tenant from `?tenant=...`, hostname, or fall back to apex.
 *
 * Returns either `{ kind: 'apex' }` or `{ kind: 'tutor', slug }`. The slug is
 * lowercased; it is null for custom-domain hosts (the backend resolves those
 * via Tutor.custom_domain — the frontend doesn't need to know the slug to
 * render). Reserved subdomains (www, api, admin) always resolve to apex.
 */
export function getTenant() {
  if (typeof window === 'undefined') return { kind: 'apex' };

  const params = new URLSearchParams(window.location.search);
  const override = params.get('tenant');
  if (override) {
    const slug = override.toLowerCase().trim();
    if (slug && !RESERVED.has(slug)) return { kind: 'tutor', slug };
  }

  const host = window.location.hostname.toLowerCase();
  if (APEX_HOSTS.has(host)) return { kind: 'apex' };

  for (const suffix of [APEX_SUFFIX, DEV_SUFFIX]) {
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      if (!sub) return { kind: 'apex' };
      const segs = sub.split('.');
      // demo.kotobaseed.net (a single env-apex segment) → apex of that env.
      if (segs.length === 1 && ENV_APEX_SEGMENTS.has(segs[0])) {
        return { kind: 'apex' };
      }
      // akiko.demo.kotobaseed.net → tutor 'akiko' inside the demo env.
      // akiko.kotobaseed.net → tutor 'akiko' on prod.
      const slug = segs[0];
      if (!slug || RESERVED.has(slug)) return { kind: 'apex' };
      return { kind: 'tutor', slug };
    }
  }

  // Custom domain. The backend resolves it via Tutor.custom_domain; frontend
  // just signals "this is a tutor surface, ask the API for details".
  return { kind: 'tutor', slug: null };
}

export function useTenant() {
  return useMemo(getTenant, []);
}

function _apex() {
  if (typeof window === 'undefined') return PLATFORM_APEX;
  const host = window.location.hostname;
  if (host.endsWith('.localhost')) return 'localhost';
  if (host === PLATFORM_APEX) return PLATFORM_APEX;
  if (!host.endsWith(`.${PLATFORM_APEX}`)) return host; // custom domain

  // host is `<sub>.kotobaseed.net`; figure out which segments belong to
  // the env apex (everything after the leading tutor slug, if any).
  const sub = host.slice(0, -(PLATFORM_APEX.length + 1));
  const segs = sub.split('.');
  // demo.kotobaseed.net: one segment, recognised env apex → stay here.
  if (segs.length === 1 && ENV_APEX_SEGMENTS.has(segs[0])) return host;
  // akiko.kotobaseed.net: one segment, regular tutor → strip to apex.
  if (segs.length === 1) return PLATFORM_APEX;
  // akiko.demo.kotobaseed.net: strip the leading tutor slug; remaining
  // segments + apex are the env-level apex (demo.kotobaseed.net).
  return `${segs.slice(1).join('.')}.${PLATFORM_APEX}`;
}

function _portPart() {
  if (typeof window === 'undefined') return '';
  return window.location.port ? `:${window.location.port}` : '';
}

/**
 * Build a URL on a specific tutor's subdomain, mirroring our current host.
 *
 * Dev (localhost): keeps the port and uses `<slug>.localhost:5173`.
 * Prod (kotobaseed.net or any other apex): uses `<slug>.<apex>`.
 *
 * Used for handing off from the apex (signup, onboarding return) to the
 * tutor's own subdomain — typically with a `#token=...` fragment so the
 * dashboard can pick up the JWT.
 */
export function tutorSiteUrl(slug, path = '/', fragment = '') {
  if (typeof window === 'undefined') return path;
  const { protocol } = window.location;
  const frag = fragment ? `#${fragment}` : '';
  return `${protocol}//${slug}.${_apex()}${_portPart()}${path}${frag}`;
}

/**
 * Build a URL back on the apex (Kotobaseed main site). Used from tutor
 * subdomains to let visitors (and the tutor themselves) return to the
 * marketplace / browse other tutors.
 */
export function apexUrl(path = '/') {
  if (typeof window === 'undefined') return path;
  const { protocol } = window.location;
  return `${protocol}//${_apex()}${_portPart()}${path}`;
}

/**
 * True when the current host is the demo environment (demo.kotobaseed.net
 * or any tutor subdomain of it). Used to retarget chrome CTAs that don't
 * make sense in a demo context — e.g. /login and /register, which on
 * demo should funnel to /try (the role chooser) instead of the real
 * auth pages, because demo accounts are passwordless seeded.
 *
 * NOTE: don't derive this from PLATFORM_APEX. The staging build sets
 * PLATFORM_APEX = "demo.kotobaseed.net" itself, so `demo.${PLATFORM_APEX}`
 * would resolve to "demo.demo.kotobaseed.net" and never match anything.
 * Hard-coding the literal demo hostname is correct and intentional.
 */
const DEMO_APEX = 'demo.kotobaseed.net';
export function isDemoEnv() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === DEMO_APEX || host.endsWith(`.${DEMO_APEX}`);
}

/**
 * Rewrite the shared signed-out chrome HTML for the current host.
 *
 * Two passes:
 *  1. Strip `https://kotobaseed.net/` → `/` so every link is relative
 *     and naturally stays on the current host (apex, demo, tenant).
 *     The template can't ship relative URLs because the same markup
 *     is also injected into BeeRanked /news/* static pages, where
 *     relative paths resolve against /news/, not the apex.
 *  2. On demo, retarget the static chrome's `/login` and `/register`
 *     CTAs to `/try` — visitors clicking those in the top nav want
 *     into the demo, not the real auth pages. TryLanding has an
 *     escape hatch ("Already have a real account?") for the rare
 *     case of a real user landing on demo.
 */
export function rewriteSpaChrome(html) {
  let out = html.replace(/https:\/\/kotobaseed\.net\//g, '/');
  if (isDemoEnv()) {
    out = out.replace(/href="\/(login|register)"/g, 'href="/try"');
  }
  return out;
}
