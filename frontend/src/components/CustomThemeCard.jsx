import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

// Custom theme commerce surface for tutors. Drives the entire order
// lifecycle from the dashboard's Site section:
//   - No order yet → "Get a custom theme" brief form
//   - Open order → status card with payment buttons / review entry
//   - DELIVERED → small "Live" confirmation that hides the brief CTA
//
// Pricing is computed client-side as a display estimate; the backend
// owns the canonical price at order-creation time.

const PRICE_TABLE = {
  standard: { free: 1499, plus: 1499, pro: 1049, business: 899 },
  premium: { free: 2499, plus: 2499, pro: 1749, business: 1499 },
};

const STATUS_COPY = {
  draft: {
    headline: 'Almost there — pay the 50% deposit to start the design',
    helper:
      'Once you pay, our team starts on 3 concept designs based on your brief. Deposit is non-refundable if you reject all 3 (industry standard for design services).',
  },
  deposit_paid: {
    headline: 'In production — 3 concepts coming soon',
    helper:
      'Our designer is working on your concepts. Expect 3 options within a few business days. We email you the moment they’re ready to review.',
  },
  concepts_ready: {
    headline: 'Your 3 concepts are ready to review',
    helper: 'Pick the one you love, or request a round of adjustments.',
  },
  reviewing: {
    headline: 'Reviewing concepts',
    helper: 'Take your time. Pick one or ask for a revision.',
  },
  revising: {
    headline: 'Revision underway',
    helper: 'Our designer is incorporating your feedback. We’ll email when the updated concepts are ready.',
  },
  approved: {
    headline: 'Concept approved — pay the final 50% to deliver',
    helper:
      'Once the final payment lands we apply the theme to your site (or every seat if it’s a team theme) within a few business days.',
  },
  final_paid: {
    headline: 'Final payment received — delivering your theme',
    helper: 'Hold tight. Your site will look bespoke very soon.',
  },
  delivered: {
    headline: 'Your custom theme is live',
    helper: 'Visit your tutor site to see it. Tweaks? Open a support ticket and we’ll help.',
  },
  cancelled: {
    headline: 'Order cancelled',
    helper: 'You can start a new order any time.',
  },
};

const CustomThemeCard = () => {
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [busy, setBusy] = useState(null);
  const [pkg, setPkg] = useState('standard');
  const [applyToTeam, setApplyToTeam] = useState(false);
  const [brief, setBrief] = useState({
    audience: '',
    tone: '',
    language_focus: '',
    color_leanings: '',
    inspiration_links: '',
    photo_url: '',
    extra_notes: '',
  });
  const [revisionNotes, setRevisionNotes] = useState('');

  const tier = (currentUser?.subscription_tier || 'free').toLowerCase();

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/custom-themes');
      setOrders(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load theme orders.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = orders.find(
    (o) => !['delivered', 'cancelled'].includes(o.status),
  );

  const createOrder = async (e) => {
    e?.preventDefault?.();
    setBusy('create');
    try {
      const body = {
        package: pkg,
        apply_to_team: applyToTeam,
        brief: {
          audience: brief.audience.trim() || null,
          tone: brief.tone.trim() || null,
          language_focus: brief.language_focus.trim() || null,
          color_leanings: brief.color_leanings.trim() || null,
          inspiration_links: brief.inspiration_links
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          photo_url: brief.photo_url.trim() || null,
          extra_notes: brief.extra_notes.trim() || null,
        },
      };
      const res = await client.post('/custom-themes', body);
      addToast('Brief saved. Pay the deposit to start the design.', 'success');
      setShowForm(false);
      setOrders([res.data, ...orders]);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not create order.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const payDeposit = async (orderId) => {
    setBusy(`deposit-${orderId}`);
    try {
      const res = await client.post(`/custom-themes/${orderId}/deposit-checkout`);
      window.location.href = res.data.checkout_url;
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not start checkout.'), 'error');
      setBusy(null);
    }
  };

  const payFinal = async (orderId) => {
    setBusy(`final-${orderId}`);
    try {
      const res = await client.post(`/custom-themes/${orderId}/final-checkout`);
      window.location.href = res.data.checkout_url;
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not start checkout.'), 'error');
      setBusy(null);
    }
  };

  const pickConcept = async (orderId, index) => {
    if (
      !(await confirm({
        title: 'Approve this concept',
        message:
          'Approving moves the order to the final payment step. The other concepts will no longer be selectable. Continue?',
        confirmText: 'Approve',
      }))
    )
      return;
    setBusy(`select-${orderId}`);
    try {
      const res = await client.post(`/custom-themes/${orderId}/select`, {
        concept_index: index,
      });
      addToast('Concept approved. Pay the final 50% to deliver.', 'success');
      const newOrders = orders.map((o) => (o.id === orderId ? res.data : o));
      setOrders(newOrders);
      setShowReview(false);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not approve.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const requestRevision = async (orderId) => {
    if (!revisionNotes.trim()) {
      addToast('Tell the designer what to change.', 'error');
      return;
    }
    setBusy(`rev-${orderId}`);
    try {
      const res = await client.post(`/custom-themes/${orderId}/request-revision`, {
        notes: revisionNotes.trim(),
      });
      addToast('Revision requested. Designer will get to it shortly.', 'success');
      const newOrders = orders.map((o) => (o.id === orderId ? res.data : o));
      setOrders(newOrders);
      setRevisionNotes('');
      setShowReview(false);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not request revision.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const cancelOrder = async (orderId, hasPaid) => {
    if (
      !(await confirm({
        title: 'Cancel order',
        message: hasPaid
          ? 'Cancel this order? Your deposit is non-refundable per the order terms.'
          : 'Cancel this order? Nothing has been charged yet.',
        confirmText: 'Cancel order',
        destructive: true,
      }))
    )
      return;
    setBusy(`cancel-${orderId}`);
    try {
      const res = await client.post(`/custom-themes/${orderId}/cancel`);
      const newOrders = orders.map((o) => (o.id === orderId ? res.data : o));
      setOrders(newOrders);
      addToast('Order cancelled.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not cancel.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <SkeletonCard />;

  const estimatePrice = PRICE_TABLE[pkg][tier] || PRICE_TABLE[pkg].free;

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Custom-designed theme</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            A bespoke site design crafted for your tutoring brand. 3 concepts, up to 2
            revisions, delivered straight to your live site.
          </p>
        </div>
      </header>

      {/* Open order status card */}
      {open && (
        <div className="border border-kotoba-primary/30 bg-kotoba-primary/5 rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-primary">
                {open.package} package · Order #{open.id}
              </p>
              <h3 className="mt-1 font-bold text-kotoba-primary">
                {STATUS_COPY[open.status]?.headline || open.status}
              </h3>
              <p className="text-sm text-kotoba-text mt-1">
                {STATUS_COPY[open.status]?.helper}
              </p>
              <p className="text-xs text-kotoba-text/60 mt-2">
                Total €{(open.total_cents / 100).toFixed(2)} · €
                {(open.deposit_cents / 100).toFixed(2)} deposit · €
                {(open.final_cents / 100).toFixed(2)} on delivery
                {open.discount_percent > 0 && ` (${open.discount_percent}% off)`}
              </p>
            </div>
            <div className="flex flex-col gap-2 min-w-[160px]">
              {open.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => payDeposit(open.id)}
                  disabled={busy === `deposit-${open.id}`}
                  className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
                >
                  Pay €{(open.deposit_cents / 100).toFixed(2)} deposit
                </button>
              )}
              {open.status === 'concepts_ready' && (
                <button
                  type="button"
                  onClick={() => setShowReview(!showReview)}
                  className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
                >
                  Review concepts
                </button>
              )}
              {open.status === 'approved' && (
                <button
                  type="button"
                  onClick={() => payFinal(open.id)}
                  disabled={busy === `final-${open.id}`}
                  className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
                >
                  Pay €{(open.final_cents / 100).toFixed(2)} final
                </button>
              )}
              {['draft', 'deposit_paid', 'concepts_ready', 'reviewing', 'revising', 'approved'].includes(open.status) && (
                <button
                  type="button"
                  onClick={() => cancelOrder(open.id, open.status !== 'draft')}
                  disabled={busy === `cancel-${open.id}`}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Cancel order
                </button>
              )}
            </div>
          </div>

          {showReview && open.concept_previews?.length > 0 && (
            <div className="border-t border-kotoba-primary/20 pt-3 space-y-3">
              <p className="text-sm text-kotoba-text">
                Pick one of the three concepts below to approve, or request a revision
                round ({2 - open.revision_count} {open.revision_count === 1 ? 'revision' : 'revisions'} remaining).
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {open.concept_previews.map((c, idx) => (
                  <div key={idx} className="border border-kotoba-text/10 rounded-md p-3 space-y-2 bg-white">
                    <p className="font-semibold text-kotoba-primary text-sm">
                      {idx + 1}. {c.label}
                    </p>
                    {c.image_url && (
                      <a href={c.image_url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={c.image_url}
                          alt={c.label}
                          className="w-full rounded border border-kotoba-text/10"
                        />
                      </a>
                    )}
                    {c.notes && (
                      <p className="text-xs text-kotoba-text/70">{c.notes}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => pickConcept(open.id, idx)}
                      disabled={busy === `select-${open.id}`}
                      className="w-full px-3 py-1.5 rounded bg-kotoba-secondary text-kotoba-text text-sm font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-50"
                    >
                      Approve this one
                    </button>
                  </div>
                ))}
              </div>

              {open.revision_count < 2 && (
                <div className="border border-kotoba-text/10 rounded-md p-3 bg-white space-y-2">
                  <p className="text-sm font-semibold text-kotoba-text">
                    Request a revision round
                  </p>
                  <p className="text-xs text-kotoba-text/60">
                    Be specific — "warmer hero photo", "swap accent color", etc.
                  </p>
                  <textarea
                    value={revisionNotes}
                    onChange={(e) => setRevisionNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                  />
                  <button
                    type="button"
                    onClick={() => requestRevision(open.id)}
                    disabled={busy === `rev-${open.id}` || !revisionNotes.trim()}
                    className="px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary text-sm font-semibold hover:bg-kotoba-primary hover:text-white disabled:opacity-50"
                  >
                    Send revision notes
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* "Start a new order" form */}
      {!open && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full px-5 py-3 rounded-md border-2 border-dashed border-kotoba-primary/50 text-kotoba-primary font-semibold hover:bg-kotoba-primary/5"
        >
          + Order a custom theme
        </button>
      )}

      {!open && showForm && (
        <form onSubmit={createOrder} className="border border-kotoba-text/15 rounded-lg p-4 bg-kotoba-background/20 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Package</label>
              <select
                value={pkg}
                onChange={(e) => setPkg(e.target.value)}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              >
                <option value="standard">Standard — full home page</option>
                <option value="premium">Premium — home + article + module covers</option>
              </select>
              <p className="text-xs text-kotoba-text/60 mt-1">
                Estimated price for your tier: <strong>€{estimatePrice}</strong>
              </p>
            </div>
            {currentUser?.subscription_tier === 'business' && (
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="apply-to-team"
                  checked={applyToTeam}
                  onChange={(e) => setApplyToTeam(e.target.checked)}
                />
                <label htmlFor="apply-to-team" className="text-sm text-kotoba-text">
                  Apply to every seat on my team
                </label>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Audience</label>
              <input
                type="text"
                value={brief.audience}
                onChange={(e) => setBrief({ ...brief, audience: e.target.value })}
                placeholder="e.g. Adult professionals learning Greek"
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Tone / vibe</label>
              <input
                type="text"
                value={brief.tone}
                onChange={(e) => setBrief({ ...brief, tone: e.target.value })}
                placeholder="e.g. warm, scholarly, modern"
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Language focus</label>
              <input
                type="text"
                value={brief.language_focus}
                onChange={(e) => setBrief({ ...brief, language_focus: e.target.value })}
                placeholder="e.g. Modern Greek"
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Color leanings</label>
              <input
                type="text"
                value={brief.color_leanings}
                onChange={(e) => setBrief({ ...brief, color_leanings: e.target.value })}
                placeholder="e.g. earth tones, blues, avoid neon"
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Inspiration links (one per line)</label>
            <textarea
              value={brief.inspiration_links}
              onChange={(e) => setBrief({ ...brief, inspiration_links: e.target.value })}
              rows={2}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Hero photo URL (optional)</label>
            <input
              type="url"
              value={brief.photo_url}
              onChange={(e) => setBrief({ ...brief, photo_url: e.target.value })}
              placeholder="Link to a Dropbox or Drive image"
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Anything else?</label>
            <textarea
              value={brief.extra_notes}
              onChange={(e) => setBrief({ ...brief, extra_notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-kotoba-text/10">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-kotoba-text/60 hover:text-kotoba-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy === 'create'}
              className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
            >
              {busy === 'create' ? 'Saving…' : 'Submit brief'}
            </button>
          </div>
        </form>
      )}

      {/* History */}
      {orders.some((o) => ['delivered', 'cancelled'].includes(o.status)) && (
        <details className="border border-kotoba-text/10 rounded-md">
          <summary className="px-4 py-2 cursor-pointer text-sm text-kotoba-text/70">
            Past orders
          </summary>
          <ul className="divide-y divide-kotoba-text/10">
            {orders
              .filter((o) => ['delivered', 'cancelled'].includes(o.status))
              .map((o) => (
                <li key={o.id} className="px-4 py-2 text-sm">
                  <span className="font-mono text-xs text-kotoba-text/60">#{o.id}</span>{' '}
                  {o.package} · {o.status} · €{(o.total_cents / 100).toFixed(2)}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
};

export default CustomThemeCard;
