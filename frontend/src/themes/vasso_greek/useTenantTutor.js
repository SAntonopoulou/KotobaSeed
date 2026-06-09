import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useTenant } from '../../hooks/useTenant';

// useTenantTutor — fetches `/tutor/me` for the current tenant and
// caches the result on `window` so every themed route on a single page
// load shares one fetch. Returns { tutor, loading, error }.
//
// Used by the per-route themed branch wrappers (e.g.
// `<ThemedArticles />`) so they can decide whether to render the
// vasso-greek variant or fall back to the default Kotobaseed page.

const CACHE_KEY = '__koto_tenant_tutor_promise';

function getOrCreateFetch() {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  if (window[CACHE_KEY]) return window[CACHE_KEY];
  const promise = client
    .get('/tutor/me')
    .then((res) => res.data)
    .catch(() => null);
  window[CACHE_KEY] = promise;
  return promise;
}

export function useTenantTutor() {
  const tenant = useTenant();
  const [state, setState] = useState({ tutor: null, loading: true, error: null });

  useEffect(() => {
    if (tenant.kind !== 'tutor') {
      setState({ tutor: null, loading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    getOrCreateFetch().then((tutor) => {
      if (cancelled) return;
      setState({ tutor, loading: false, error: null });
    });
    return () => { cancelled = true; };
  }, [tenant.kind]);

  return state;
}
