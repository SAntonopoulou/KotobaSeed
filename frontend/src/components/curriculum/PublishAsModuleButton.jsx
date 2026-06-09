import React, { useState } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../utils/errors';

// Copies the curriculum's lessons into a new sellable LessonModule.
// The copy is independent — future curriculum edits don't propagate
// (per Sophia's "module is a copy" decision in the architecture doc).

const PublishAsModuleButton = ({ curriculumId, lessonCount }) => {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    summary: '',
    price_cents: 0,
    is_published: false,
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await client.post(`/curriculum/${curriculumId}/publish-as-module`, {
        title: form.title || null,
        summary: form.summary || null,
        price_cents: parseInt(form.price_cents, 10) || 0,
        currency: 'eur',
        is_published: form.is_published,
      });
      addToast(`Module created with ${res.data.article_ids.length} lessons.`, 'success');
      setOpen(false);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not publish as module.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (lessonCount === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-md border border-kotoba-primary text-kotoba-primary text-xs font-semibold hover:bg-kotoba-primary hover:text-white"
      >
        Publish as module ↗
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-kotoba-text/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg space-y-4">
            <div>
              <h3 className="font-display text-xl font-bold text-kotoba-primary">Publish as a sellable module</h3>
              <p className="text-xs text-kotoba-text/60 mt-1">
                Creates a copy of this curriculum's {lessonCount} lesson{lessonCount === 1 ? '' : 's'} as articles, then bundles them into a new module students can buy. The copy is independent — future edits here won't sync to the module.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Module title (defaults to the curriculum's title)</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Beginner Greek — Complete course"
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Short summary (one line)</label>
              <input
                type="text"
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                placeholder="What students will get out of this"
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Price (€)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={Math.floor(form.price_cents / 100)}
                  onChange={(e) => setForm((f) => ({ ...f, price_cents: (parseInt(e.target.value, 10) || 0) * 100 }))}
                  className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
                />
                <p className="text-[10px] text-kotoba-text/50 mt-1">Whole euros. Set 0 for a free module.</p>
              </div>
              <label className="flex items-end gap-2 text-sm pb-2">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                />
                <span>Publish immediately</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 text-sm text-kotoba-text/70 hover:text-kotoba-text">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50">
                {busy ? 'Publishing…' : 'Create module'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default PublishAsModuleButton;
