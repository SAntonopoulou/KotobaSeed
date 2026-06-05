import { useMemo } from 'react';

const RESERVED = new Set(['www', 'api', 'admin']);

const APEX_HOSTS = new Set([
  'kotobaseed.net',
  'localhost',
  '127.0.0.1',
]);

const APEX_SUFFIX = '.kotobaseed.net';
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
      const slug = host.slice(0, -suffix.length);
      if (!slug || slug.includes('.')) return { kind: 'apex' };
      if (RESERVED.has(slug)) return { kind: 'apex' };
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
  const { protocol, hostname, port } = window.location;
  const portPart = port ? `:${port}` : '';
  // Apex hosts: drop any subdomain by treating the apex as `hostname`.
  // For localhost/127.0.0.1 we still treat as apex (no existing subdomain).
  let apex = hostname;
  if (apex.endsWith('.localhost')) apex = 'localhost';
  if (apex.endsWith('.kotobaseed.net')) apex = 'kotobaseed.net';
  const frag = fragment ? `#${fragment}` : '';
  return `${protocol}//${slug}.${apex}${portPart}${path}${frag}`;
}
