import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SkeletonCard } from '../../components/Skeleton';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/dates';

// Admin queue for the custom-design service. Designer hands us 3 preview
// links + a name for each; admin uploads them via "Mark concepts ready"
// to push the order into the tutor's review screen. After the tutor
// approves + final-pays, admin pastes the final TutorPageSection layout
// JSON in the design tab and clicks Finalize to apply.

const STATUS_TONE = {
  draft: 'bg-kotoba-text/10 text-kotoba-text/70',
  deposit_paid: 'bg-amber-100 text-amber-900',
  concepts_ready: 'bg-kotoba-secondary/30 text-kotoba-text',
  reviewing: 'bg-kotoba-secondary/30 text-kotoba-text',
  revising: 'bg-amber-100 text-amber-900',
  approved: 'bg-kotoba-primary/15 text-kotoba-primary',
  final_paid: 'bg-amber-100 text-amber-900',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
};

const formatTime = (iso) => {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
};

const AdminCustomThemes = () => {
  const { addToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('deposit_paid');
  const [busy, setBusy] = useState(null);
  const [openOrderId, setOpenOrderId] = useState(null);
  const [concepts, setConcepts] = useState([
    { label: '', image_url: '', notes: '' },
    { label: '', image_url: '', notes: '' },
    { label: '', image_url: '', notes: '' },
  ]);
  const [designerNotes, setDesignerNotes] = useState('');
  const [designName, setDesignName] = useState('');
  const [designPayloadText, setDesignPayloadText] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/custom-themes', {
        params: filter === 'all' ? {} : { status_filter: filter },
      });
      setOrders(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load orders.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const openDetail = (order) => {
    setOpenOrderId(order.id);
    setDesignerNotes(order.designer_notes || '');
    setConcepts(
      (order.concept_previews && order.concept_previews.length === 3
        ? order.concept_previews.map((c) => ({
            label: c.label || '',
            image_url: c.image_url || '',
            notes: c.notes || '',
          }))
        : [
            { label: '', image_url: '', notes: '' },
            { label: '', image_url: '', notes: '' },
            { label: '', image_url: '', notes: '' },
          ]),
    );
    setDesignName('');
    setDesignPayloadText('');
  };

  const uploadConcepts = async (orderId) => {
    const valid = concepts.filter((c) => c.label.trim() && c.image_url.trim());
    if (valid.length < 1) {
      addToast('At least one concept must have a label + image URL.', 'error');
      return;
    }
    setBusy(`concepts-${orderId}`);
    try {
      await client.post(`/admin/custom-themes/${orderId}/concepts`, {
        concepts: valid.map((c) => ({
          label: c.label.trim(),
          image_url: c.image_url.trim(),
          notes: c.notes.trim() || null,
        })),
        designer_notes: designerNotes.trim() || null,
      });
      addToast('Concepts uploaded. Tutor has been notified.', 'success');
      setOpenOrderId(null);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Upload failed.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const attachDesign = async (orderId) => {
    if (!designName.trim() || !designPayloadText.trim()) {
      addToast('Both name and JSON payload are required.', 'error');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(designPayloadText);
    } catch {
      addToast('Design payload is not valid JSON.', 'error');
      return;
    }
    if (!Array.isArray(parsed)) {
      addToast('Design payload must be a JSON array of sections.', 'error');
      return;
    }
    setBusy(`design-${orderId}`);
    try {
      await client.post(`/admin/custom-themes/${orderId}/design`, {
        name: designName.trim(),
        design_payload: parsed,
      });
      addToast('Design attached. Click Finalize to apply.', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not attach design.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const finalize = async (orderId) => {
    setBusy(`finalize-${orderId}`);
    try {
      await client.post(`/admin/custom-themes/${orderId}/finalize`);
      addToast('Theme applied + delivered.', 'success');
      setOpenOrderId(null);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Finalize failed.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const detail = useMemo(
    () => orders.find((o) => o.id === openOrderId),
    [orders, openOrderId],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-kotoba-text">Custom theme orders</h1>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Designer handoff queue. Upload 3 concepts when the design is ready, attach
            the final TutorPageSection JSON when the tutor pays the final 50%.
          </p>
        </div>
        <Link to="/admin/dashboard" className="text-sm text-kotoba-text/70 hover:text-kotoba-primary">
          ← Admin home
        </Link>
      </header>

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm"
          >
            <option value="deposit_paid">Awaiting concepts</option>
            <option value="concepts_ready">Tutor reviewing</option>
            <option value="revising">Revisions requested</option>
            <option value="approved">Awaiting final payment</option>
            <option value="final_paid">Awaiting delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        </div>

        {loading ? (
          <SkeletonCard />
        ) : orders.length === 0 ? (
          <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
            Nothing in this bucket.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-kotoba-text/10">
              <thead className="bg-kotoba-background/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase">Order</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase">Package</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase">Updated</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-kotoba-text/60 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-kotoba-text/10">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2 text-sm font-mono text-kotoba-text">#{o.id}</td>
                    <td className="px-4 py-2 text-sm text-kotoba-text">{o.package}</td>
                    <td className="px-4 py-2 text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          STATUS_TONE[o.status] || 'bg-kotoba-text/10 text-kotoba-text/70'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-kotoba-text/60">{formatTime(o.updated_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openDetail(o)}
                        className="text-sm text-kotoba-primary hover:underline"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && (
        <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <header className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60">
                Order #{detail.id} · {detail.package} · {detail.status}
              </p>
              <h2 className="mt-1 text-lg font-bold text-kotoba-primary">
                Total €{(detail.total_cents / 100).toFixed(2)} · deposit €{(detail.deposit_cents / 100).toFixed(2)}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpenOrderId(null)}
              className="text-sm text-kotoba-text/60 hover:text-kotoba-text"
            >
              Close
            </button>
          </header>

          {/* Brief */}
          <div className="border border-kotoba-text/10 rounded-md p-4 bg-kotoba-background/20 space-y-1">
            <h3 className="text-sm font-semibold text-kotoba-text">Brief</h3>
            <pre className="text-xs text-kotoba-text/80 whitespace-pre-wrap break-words font-mono">
              {JSON.stringify(detail.brief, null, 2)}
            </pre>
          </div>

          {/* Revision notes */}
          {detail.revision_notes && detail.revision_notes.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-md p-4 space-y-2">
              <h3 className="text-sm font-semibold text-amber-900">Revision notes from tutor</h3>
              {detail.revision_notes.map((r, idx) => (
                <div key={idx}>
                  <p className="text-xs font-semibold text-amber-900">Round {r.round}</p>
                  <p className="text-sm text-amber-900">{r.notes}</p>
                </div>
              ))}
            </div>
          )}

          {/* Concept upload (deposit_paid OR revising) */}
          {(detail.status === 'deposit_paid' || detail.status === 'revising') && (
            <div className="border border-kotoba-text/15 rounded-md p-4 space-y-3">
              <h3 className="text-sm font-semibold text-kotoba-text">Upload 3 concept previews</h3>
              {concepts.map((c, idx) => (
                <div key={idx} className="grid sm:grid-cols-3 gap-2 border-b border-kotoba-text/5 pb-2 last:border-b-0">
                  <input
                    type="text"
                    placeholder={`Concept ${idx + 1} label`}
                    value={c.label}
                    onChange={(e) => {
                      const next = [...concepts];
                      next[idx] = { ...c, label: e.target.value };
                      setConcepts(next);
                    }}
                    className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm"
                  />
                  <input
                    type="url"
                    placeholder="Preview image URL"
                    value={c.image_url}
                    onChange={(e) => {
                      const next = [...concepts];
                      next[idx] = { ...c, image_url: e.target.value };
                      setConcepts(next);
                    }}
                    className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Designer notes (optional)"
                    value={c.notes}
                    onChange={(e) => {
                      const next = [...concepts];
                      next[idx] = { ...c, notes: e.target.value };
                      setConcepts(next);
                    }}
                    className="px-3 py-1.5 border border-kotoba-text/20 rounded text-sm"
                  />
                </div>
              ))}
              <textarea
                placeholder="Designer notes for the tutor (optional)"
                value={designerNotes}
                onChange={(e) => setDesignerNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
              <button
                type="button"
                onClick={() => uploadConcepts(detail.id)}
                disabled={busy === `concepts-${detail.id}`}
                className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
              >
                {busy === `concepts-${detail.id}` ? 'Uploading…' : 'Mark concepts ready'}
              </button>
            </div>
          )}

          {/* Design attach + finalize (final_paid only) */}
          {detail.status === 'final_paid' && (
            <div className="border border-kotoba-text/15 rounded-md p-4 space-y-3">
              <h3 className="text-sm font-semibold text-kotoba-text">Attach final design + deliver</h3>
              <p className="text-xs text-kotoba-text/60">
                Paste the TutorPageSection layout JSON: an array of
                {' '}<code className="font-mono">{`{section_type, position, is_visible, content}`}</code> objects.
                See <code className="font-mono">DESIGNER_KIT.md</code> for the section
                catalogue.
              </p>
              <input
                type="text"
                placeholder="Theme name (e.g. Vasso Spring 2026)"
                value={designName}
                onChange={(e) => setDesignName(e.target.value)}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
              <textarea
                placeholder='[{"section_type":"hero_portrait","position":0,"is_visible":true,"content":{...}}, ...]'
                value={designPayloadText}
                onChange={(e) => setDesignPayloadText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-xs font-mono"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => attachDesign(detail.id)}
                  disabled={busy === `design-${detail.id}`}
                  className="px-5 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary text-sm font-semibold hover:bg-kotoba-primary hover:text-white disabled:opacity-50"
                >
                  Attach design
                </button>
                {detail.delivered_theme_id && (
                  <button
                    type="button"
                    onClick={() => finalize(detail.id)}
                    disabled={busy === `finalize-${detail.id}`}
                    className="px-5 py-2 rounded-md bg-kotoba-primary text-white text-sm font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
                  >
                    {busy === `finalize-${detail.id}` ? 'Delivering…' : 'Finalize & deliver'}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default AdminCustomThemes;
