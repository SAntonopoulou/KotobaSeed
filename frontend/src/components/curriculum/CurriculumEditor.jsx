import React, { useEffect, useState } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ModalContext';
import { getErrorMessage } from '../../utils/errors';
import LessonEditor from './LessonEditor';
import PublishAsModuleButton from './PublishAsModuleButton';

// Edit one curriculum: header form + ordered lessons list. Lessons can
// be added, reordered (up/down arrows for v1; drag-and-drop later), and
// each opens its own LessonEditor inline.

const CEFR = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const CurriculumEditor = ({ curriculum, onClose }) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(curriculum);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [showNewLesson, setShowNewLesson] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [c, ls] = await Promise.all([
        client.get(`/curriculum/${curriculum.id}`),
        client.get(`/curriculum/${curriculum.id}/lessons`),
      ]);
      setData(c.data);
      setLessons(ls.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load curriculum.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [curriculum.id]);

  const saveHeader = async (patch) => {
    setSaving(true);
    try {
      const res = await client.patch(`/curriculum/${curriculum.id}`, patch);
      setData(res.data);
      addToast('Saved.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not save.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const addLesson = async () => {
    const title = newLessonTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      const res = await client.post(`/curriculum/${curriculum.id}/lessons`, {
        title,
      });
      setLessons((prev) => [...prev, res.data]);
      setNewLessonTitle('');
      setShowNewLesson(false);
      setEditingLessonId(res.data.id);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not add.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const archiveLesson = async (l) => {
    const ok = await confirm({
      title: 'Archive lesson',
      message: `Archive "${l.title}"? Student delivery history is kept; you can find archived lessons later.`,
      confirmText: 'Archive',
      destructive: false,
    });
    if (!ok) return;
    try {
      await client.delete(`/curriculum/${curriculum.id}/lessons/${l.id}`);
      setLessons((prev) => prev.filter((x) => x.id !== l.id));
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not archive.'), 'error');
    }
  };

  const hardDeleteLesson = async (l) => {
    const ok = await confirm({
      title: 'Delete lesson permanently',
      message: `Delete "${l.title}", its homework templates, and any student delivery history of it? This can't be undone.`,
      confirmText: 'Delete forever',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/curriculum/${curriculum.id}/lessons/${l.id}/permanent`);
      setLessons((prev) => prev.filter((x) => x.id !== l.id));
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not delete.'), 'error');
    }
  };

  const move = async (idx, delta) => {
    const target = idx + delta;
    if (target < 0 || target >= lessons.length) return;
    const next = [...lessons];
    [next[idx], next[target]] = [next[target], next[idx]];
    setLessons(next);
    try {
      await client.post(`/curriculum/${curriculum.id}/lessons/reorder`, {
        lesson_ids: next.map((l) => l.id),
      });
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not reorder.'), 'error');
      load();
    }
  };

  if (editingLessonId !== null) {
    return (
      <LessonEditor
        curriculumId={curriculum.id}
        lessonId={editingLessonId}
        onClose={() => { setEditingLessonId(null); load(); }}
      />
    );
  }

  if (!data) return null;

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-kotoba-text/60 hover:text-kotoba-primary"
        >
          ← Back to curriculums
        </button>
        <PublishAsModuleButton curriculumId={curriculum.id} lessonCount={lessons.length} />
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Title</label>
          <input
            type="text"
            value={data.title}
            onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))}
            onBlur={(e) => e.target.value !== curriculum.title && saveHeader({ title: e.target.value })}
            className="w-full px-3 py-2 text-lg font-bold text-kotoba-primary border border-kotoba-text/15 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Language</label>
            <input
              type="text"
              value={data.language || ''}
              onChange={(e) => setData((d) => ({ ...d, language: e.target.value }))}
              onBlur={(e) => saveHeader({ language: e.target.value || null })}
              placeholder="Greek"
              className="w-full px-3 py-2 border border-kotoba-text/15 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">CEFR level</label>
            <select
              value={data.level || ''}
              onChange={(e) => { const v = e.target.value || null; setData((d) => ({ ...d, level: v })); saveHeader({ level: v }); }}
              className="w-full px-3 py-2 border border-kotoba-text/15 rounded text-sm"
            >
              {CEFR.map((l) => <option key={l} value={l}>{l || '— unspecified —'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Cover image URL</label>
            <input
              type="text"
              value={data.cover_image_url || ''}
              onChange={(e) => setData((d) => ({ ...d, cover_image_url: e.target.value }))}
              onBlur={(e) => saveHeader({ cover_image_url: e.target.value || null })}
              placeholder="https://…"
              className="w-full px-3 py-2 border border-kotoba-text/15 rounded text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Description</label>
          <textarea
            value={data.description || ''}
            onChange={(e) => setData((d) => ({ ...d, description: e.target.value }))}
            onBlur={(e) => saveHeader({ description: e.target.value || null })}
            rows={3}
            placeholder="What this curriculum covers, who it's for…"
            className="w-full px-3 py-2 border border-kotoba-text/15 rounded text-sm"
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.is_school_library === true}
            onChange={(e) => {
              const v = e.target.checked;
              setData((d) => ({ ...d, is_school_library: v }));
              saveHeader({ is_school_library: v });
            }}
            className="mt-1"
          />
          <span>
            <strong>Share with my school</strong>
            <span className="block text-xs text-kotoba-text/60">
              Other teachers in your school team can read this curriculum and clone it to their own library. Your edits don't propagate to their copies.
            </span>
          </span>
        </label>
      </div>

      <div className="border-t border-kotoba-text/10 pt-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-base font-bold text-kotoba-text">Lessons</h3>
          <button
            type="button"
            onClick={() => setShowNewLesson(true)}
            className="text-sm font-semibold text-kotoba-primary hover:underline"
          >
            + Add lesson
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-kotoba-text/60">Loading…</p>
        ) : lessons.length === 0 && !showNewLesson ? (
          <p className="text-sm text-kotoba-text/60 italic">No lessons yet. Click "Add lesson" to start.</p>
        ) : (
          <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
            {lessons.map((l, idx) => (
              <li key={l.id} className="px-3 py-3 flex items-center gap-3">
                <span className="text-xs font-mono text-kotoba-text/40 w-6 text-center">{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => setEditingLessonId(l.id)}
                  className="flex-grow text-left min-w-0"
                >
                  <p className="font-medium text-kotoba-primary truncate">{l.title}</p>
                  {l.summary && <p className="text-xs text-kotoba-text/60 truncate">{l.summary}</p>}
                  <p className="text-[10px] text-kotoba-text/40 mt-0.5">
                    {l.estimated_duration_minutes} min
                    {l.attachments.length > 0 && ` · ${l.attachments.length} attachment${l.attachments.length === 1 ? '' : 's'}`}
                    {l.embedded_videos.length > 0 && ` · ${l.embedded_videos.length} video${l.embedded_videos.length === 1 ? '' : 's'}`}
                  </p>
                </button>
                <div className="flex items-center gap-1 text-sm">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="px-2 py-1 text-kotoba-text/50 hover:text-kotoba-primary disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === lessons.length - 1} className="px-2 py-1 text-kotoba-text/50 hover:text-kotoba-primary disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => setEditingLessonId(l.id)} className="px-3 py-1 rounded-md border border-kotoba-primary text-kotoba-primary hover:bg-kotoba-primary hover:text-white text-xs">Edit</button>
                  <button type="button" onClick={() => archiveLesson(l)} className="px-2 py-1 text-kotoba-text/60 hover:text-kotoba-text text-xs">Archive</button>
                  <button type="button" onClick={() => hardDeleteLesson(l)} className="px-2 py-1 text-red-600 hover:underline text-xs">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {showNewLesson && (
          <div className="mt-3 flex items-end gap-2 flex-wrap">
            <div className="flex-grow min-w-[180px]">
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">New lesson title</label>
              <input
                type="text"
                value={newLessonTitle}
                onChange={(e) => setNewLessonTitle(e.target.value)}
                placeholder="e.g. The Greek alphabet"
                autoFocus
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
            </div>
            <button type="button" onClick={addLesson} disabled={saving || !newLessonTitle.trim()} className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-semibold text-sm hover:bg-kotoba-primary/90 disabled:opacity-50">
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button type="button" onClick={() => { setShowNewLesson(false); setNewLessonTitle(''); }} className="px-3 py-2 text-sm text-kotoba-text/60 hover:text-kotoba-text">Cancel</button>
          </div>
        )}
      </div>
    </section>
  );
};

export default CurriculumEditor;
