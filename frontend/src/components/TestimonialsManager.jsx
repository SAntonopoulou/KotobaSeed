import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';

// Per-tutor testimonials manager. Tutor types in their own student
// testimonials (no public submission flow in v1). Each row has student
// name + body + rating + display_order + published toggle. Order
// controls position on the public site; lower number = higher position.

const blank = {
  student_name: '',
  location: '',
  body: '',
  rating: 5,
  display_order: 100,
  is_published: true,
};

const Star = ({ filled }) => (
  <span className={filled ? 'text-kotoba-secondary-dark' : 'text-kotoba-text/20'}>★</span>
);

const StarRating = ({ value, onChange, disabled }) => (
  <div className="inline-flex gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        type="button"
        key={n}
        onClick={() => !disabled && onChange(n)}
        disabled={disabled}
        className="text-2xl leading-none hover:scale-110 transition-transform disabled:opacity-50"
        aria-label={`Set rating to ${n}`}
      >
        <Star filled={n <= value} />
      </button>
    ))}
  </div>
);

const TestimonialsManager = () => {
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null); // null = list view, 'new' = add form, number = edit row
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/testimonials/all');
      setItems(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load testimonials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startAdd = () => {
    setEditingId('new');
    setForm({ ...blank, display_order: 100 + items.length });
    setError('');
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      student_name: item.student_name,
      location: item.location || '',
      body: item.body,
      rating: item.rating,
      display_order: item.display_order,
      is_published: item.is_published,
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(blank);
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!form.student_name.trim() || !form.body.trim()) {
      setError('A name and a body are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        student_name: form.student_name.trim(),
        location: form.location.trim() || null,
        body: form.body.trim(),
        rating: form.rating,
        display_order: form.display_order,
        is_published: form.is_published,
      };
      if (editingId === 'new') {
        await client.post('/testimonials', payload);
      } else {
        await client.patch(`/testimonials/${editingId}`, payload);
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!(await confirm({
      title: 'Delete testimonial',
      message: `Delete the testimonial from ${item.student_name}?`,
      confirmText: 'Delete',
      destructive: true,
    }))) return;
    setSaving(true);
    setError('');
    try {
      await client.delete(`/testimonials/${item.id}`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not delete.');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (item) => {
    setSaving(true);
    setError('');
    try {
      await client.patch(`/testimonials/${item.id}`, {
        is_published: !item.is_published,
      });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Testimonials</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Show student reviews on your site. Lower display-order numbers appear first. Drafts stay hidden until you publish them.
          </p>
        </div>
        {!editingId && (
          <button
            type="button"
            onClick={startAdd}
            className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
          >
            + Add testimonial
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm mb-3">
          {error}
        </div>
      )}

      {editingId !== null && (
        <form onSubmit={handleSave} className="border border-kotoba-text/10 rounded-md p-4 mb-4 space-y-3 bg-kotoba-background/30">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Student name</label>
              <input
                type="text"
                value={form.student_name}
                onChange={(e) => setForm({ ...form, student_name: e.target.value })}
                placeholder="Sara M."
                disabled={saving}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Location (optional)</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="London, UK"
                disabled={saving}
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Testimonial</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={4}
              disabled={saving}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>

          <div className="flex items-end gap-6 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Rating</label>
              <StarRating
                value={form.rating}
                onChange={(n) => setForm({ ...form, rating: n })}
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Display order</label>
              <input
                type="number"
                min={0}
                max={10000}
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value || '100', 10) })}
                disabled={saving}
                className="w-24 px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                disabled={saving}
                className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
              />
              Published
            </label>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="px-4 py-2 rounded-md text-sm text-kotoba-text/70 hover:text-kotoba-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      ) : items.length === 0 && editingId === null ? (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No testimonials yet. Add a few from happy students to give your site instant credibility.
        </p>
      ) : (
        <ul className="divide-y divide-kotoba-text/10">
          {items.map((item) => (
            <li key={item.id} className="py-3 flex items-start justify-between gap-3">
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-kotoba-text">{item.student_name}</span>
                  {item.location && (
                    <span className="text-xs text-kotoba-text/60">· {item.location}</span>
                  )}
                  <span className="inline-flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} filled={n <= item.rating} />
                    ))}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.is_published
                        ? 'bg-kotoba-primary/15 text-kotoba-primary'
                        : 'bg-kotoba-text/10 text-kotoba-text/70'
                    }`}
                  >
                    {item.is_published ? 'Published' : 'Draft'}
                  </span>
                  <span className="text-xs text-kotoba-text/50">
                    #{item.display_order}
                  </span>
                </div>
                <p className="mt-1 text-sm text-kotoba-text/80 line-clamp-2 whitespace-pre-line">
                  {item.body}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => togglePublish(item)}
                  disabled={saving}
                  className="text-sm text-kotoba-text/70 hover:text-kotoba-primary"
                >
                  {item.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  disabled={saving}
                  className="text-sm text-kotoba-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={saving}
                  className="text-sm text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default TestimonialsManager;
