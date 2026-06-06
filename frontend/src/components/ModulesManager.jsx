import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';

// Tutor's lesson modules — curriculum bundles of articles + homework
// sold as one-time purchases. Inline editor for v1; if Sophia wants a
// fuller editor we can split into a dedicated route later.

const formatPrice = (cents, currency = 'eur') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'eur').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
};

const FEE_BY_TIER = {
  free: 10,
  plus: 7,
  pro: 5,
  business: 0,
};

const ModulesManager = () => {
  const confirm = useConfirm();
  const [modules, setModules] = useState([]);
  const [articles, setArticles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [tutor, setTutor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [m, a, t, tut] = await Promise.all([
        client.get('/tutor/modules'),
        client.get('/articles/all').catch(() => ({ data: [] })),
        client.get('/tutor/homework/templates').catch(() => ({ data: [] })),
        client.get('/tutor/me').catch(() => ({ data: null })),
      ]);
      setModules(m.data || []);
      setArticles(a.data || []);
      setTemplates(t.data || []);
      setTutor(tut.data || null);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load modules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startCompose = () =>
    setEditing({
      id: null,
      title: '',
      summary: '',
      description: '',
      featured_image_url: '',
      items: [],
      price_cents: '',
      currency: 'eur',
      is_published: false,
    });

  const startEdit = async (m) => {
    try {
      const res = await client.get('/tutor/modules');
      const full = (res.data || []).find((x) => x.id === m.id);
      const detail = await fetchDetail(m.id);
      setEditing({
        id: m.id,
        title: full?.title ?? m.title,
        summary: full?.summary ?? '',
        description: detail?.description ?? '',
        featured_image_url: full?.featured_image_url ?? '',
        items: detail?.items ?? [],
        price_cents: String((full?.price_cents ?? m.price_cents) / 100),
        currency: full?.currency ?? m.currency,
        is_published: full?.is_published ?? m.is_published,
      });
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load module.');
    }
  };

  // The summary list endpoint doesn't include items + description, so we
  // pull them by reading the public detail endpoint as a fallback. (For
  // drafts the public endpoint 404s, in which case items default to [].)
  const fetchDetail = async (moduleId) => {
    const summary = modules.find((x) => x.id === moduleId);
    if (!summary || !summary.is_published) return { items: [], description: '' };
    try {
      const res = await client.get(`/modules/${summary.slug}`);
      return res.data;
    } catch {
      return { items: [], description: '' };
    }
  };

  const cancel = () => {
    setEditing(null);
    setError('');
    setInfo('');
  };

  const addItem = (kind, refId) => {
    if (!refId) return;
    const next = [...editing.items, { kind, ref_id: parseInt(refId, 10) }];
    setEditing({ ...editing, items: next });
  };
  const removeItem = (idx) =>
    setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) });
  const moveItem = (idx, delta) => {
    const next = [...editing.items];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setEditing({ ...editing, items: next });
  };

  const save = async () => {
    if (!editing.title.trim()) { setError('Add a title.'); return; }
    const priceCents = Math.round(parseFloat(editing.price_cents || '0') * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError('Price must be a non-negative number.'); return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        title: editing.title.trim(),
        summary: editing.summary?.trim() || null,
        description: editing.description?.trim() || null,
        featured_image_url: editing.featured_image_url?.trim() || null,
        items: editing.items,
        price_cents: priceCents,
        currency: editing.currency || 'eur',
        is_published: editing.is_published,
      };
      if (editing.id) {
        await client.patch(`/tutor/modules/${editing.id}`, payload);
      } else {
        await client.post('/tutor/modules', payload);
      }
      setInfo('Saved.');
      cancel();
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m) => {
    if (!(await confirm({
      title: 'Unpublish module',
      message: `Unpublish "${m.title}"? Students who already paid keep their access.`,
      confirmText: 'Unpublish',
      destructive: true,
    }))) return;
    setBusy(true);
    try {
      await client.delete(`/tutor/modules/${m.id}`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not unpublish.');
    } finally {
      setBusy(false);
    }
  };

  const tier = tutor?.plan ? 'pro' : (tutor?.user?.subscription_tier ?? 'free');
  // We don't have user.subscription_tier on /tutor/me — derive from Tutor.plan
  // best we can. For the fee preview just use tier or default to 10%.
  const feePercent = FEE_BY_TIER[tier] ?? 10;
  const previewCents = Math.round(parseFloat(editing?.price_cents || '0') * 100);
  const previewFee = Math.round(previewCents * (feePercent / 100));

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Lesson modules</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Lesson modules</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Bundle articles + homework templates into a self-paced curriculum and sell permanent access. We take 10% (Free), 7% (Plus), 5% (Pro), or 0% (Business) per sale to cover hosting.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startCompose}
            className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
          >
            + New module
          </button>
        )}
      </div>

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

      {editing && (
        <div className="border border-kotoba-text/15 rounded-lg p-4 bg-kotoba-background/20 space-y-3">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Title</label>
            <input
              type="text"
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              disabled={busy}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Summary (one-line tagline)</label>
            <input
              type="text"
              value={editing.summary}
              onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
              disabled={busy}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Description</label>
            <textarea
              value={editing.description || ''}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={3}
              disabled={busy}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Featured image URL</label>
            <input
              type="url"
              value={editing.featured_image_url}
              onChange={(e) => setEditing({ ...editing, featured_image_url: e.target.value })}
              placeholder="https://..."
              disabled={busy}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Price (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editing.price_cents}
                onChange={(e) => setEditing({ ...editing, price_cents: e.target.value })}
                placeholder="49.00"
                disabled={busy}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
              {previewCents > 0 && (
                <p className="mt-1 text-xs text-kotoba-text/60">
                  Platform fee at {feePercent}%: {formatPrice(previewFee)} · You receive {formatPrice(previewCents - previewFee)} per sale
                </p>
              )}
            </div>
            <label className="inline-flex items-center gap-2 text-sm self-end pb-2">
              <input
                type="checkbox"
                checked={editing.is_published}
                onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
                disabled={busy}
                className="h-4 w-4 text-kotoba-primary"
              />
              Published (visible on your site)
            </label>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-kotoba-text mb-2">Contents (in order)</h3>
            {editing.items.length === 0 ? (
              <p className="text-xs text-kotoba-text/60 mb-2">
                No items yet. Add articles + homework templates below.
              </p>
            ) : (
              <ul className="border border-kotoba-text/10 rounded divide-y divide-kotoba-text/10 mb-2">
                {editing.items.map((it, idx) => {
                  const source = it.kind === 'article' ? articles : templates;
                  const found = source.find((s) => s.id === it.ref_id);
                  return (
                    <li key={`${it.kind}-${it.ref_id}-${idx}`} className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-sm text-kotoba-text truncate">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-kotoba-background mr-2 font-mono">
                          {it.kind}
                        </span>
                        {found?.title || `(deleted #${it.ref_id})`}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onClick={() => moveItem(idx, -1)} className="text-kotoba-text/50 hover:text-kotoba-text px-1">↑</button>
                        <button type="button" onClick={() => moveItem(idx, 1)} className="text-kotoba-text/50 hover:text-kotoba-text px-1">↓</button>
                        <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-lg px-1">×</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="grid sm:grid-cols-2 gap-2">
              <select
                onChange={(e) => { addItem('article', e.target.value); e.target.value = ''; }}
                value=""
                disabled={busy}
                className="px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              >
                <option value="">+ Add article…</option>
                {articles.map((a) => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
              <select
                onChange={(e) => { addItem('homework', e.target.value); e.target.value = ''; }}
                value=""
                disabled={busy}
                className="px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              >
                <option value="">+ Add homework template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-kotoba-text/10">
            <button type="button" onClick={cancel} disabled={busy} className="px-4 py-2 text-sm text-kotoba-text/60 hover:text-kotoba-text">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {modules.length === 0 ? (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No modules yet. Bundle a few of your best articles + a couple of homework drills into a "Greek for Beginners" pack and start earning from your existing material.
        </p>
      ) : (
        <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
          {modules.map((m) => (
            <li key={m.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => startEdit(m)} className="font-medium text-kotoba-primary hover:underline text-left">
                    {m.title}
                  </button>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.is_published ? 'bg-kotoba-primary/15 text-kotoba-primary' : 'bg-kotoba-text/10 text-kotoba-text/70'}`}>
                    {m.is_published ? 'Published' : 'Draft'}
                  </span>
                  <span className="text-xs text-kotoba-text/60">
                    {m.item_count} {m.item_count === 1 ? 'item' : 'items'} · {formatPrice(m.price_cents, m.currency)}
                  </span>
                </div>
                {m.summary && <p className="text-xs text-kotoba-text/70 mt-1 truncate">{m.summary}</p>}
              </div>
              <div className="flex items-center gap-3">
                {m.is_published && (
                  <Link to={`/modules/${m.slug}`} className="text-sm text-kotoba-text/60 hover:underline">
                    View
                  </Link>
                )}
                <button type="button" onClick={() => startEdit(m)} className="text-sm text-kotoba-primary hover:underline">
                  Edit
                </button>
                {m.is_published && (
                  <button type="button" onClick={() => remove(m)} className="text-sm text-red-600 hover:underline">
                    Unpublish
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ModulesManager;
