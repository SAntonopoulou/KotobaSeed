// Tour route resolvers — async functions called by the tour engine
// when a step's `route` is a function rather than a string. Resolves
// runtime URLs that depend on seeded data (e.g. the demo tutor's draft
// article slug, which is random per workspace).
//
// Each resolver returns a path string or null. Null means "skip this
// step" — the engine advances past it without showing the bubble.

import client from '../api/client';

let _draftSlugCache = null;

export async function resolveDraftArticleEditRoute() {
  if (_draftSlugCache) return _draftSlugCache;
  try {
    const res = await client.get('/articles/all');
    const list = Array.isArray(res.data) ? res.data : [];
    const draft = list.find((a) => !a.is_published);
    if (!draft || !draft.slug) return null;
    const path = `/dashboard/articles/${draft.slug}/edit`;
    _draftSlugCache = path;
    return path;
  } catch {
    return null;
  }
}

// Wipe the cache when the tour ends or a session changes — guards
// against a stale slug surviving a /demo/exit + re-enter.
export function clearTourResolverCache() {
  _draftSlugCache = null;
}
