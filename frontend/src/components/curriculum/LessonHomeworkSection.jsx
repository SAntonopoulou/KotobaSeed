import React, { useEffect, useState } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ModalContext';
import { getErrorMessage } from '../../utils/errors';
import MarkdownEditor from '../editor/MarkdownEditor';

// Homework templates attached to a lesson. When the lesson is taught
// to a student (Phase 3 — LessonDelivery), every active template here
// auto-spawns a HomeworkAssignment for THAT student. This is what
// powers Sophia's "homework only goes out when I actually teach this
// lesson" model — no more blanket auto-assigns.

const TemplateRow = ({ t, isOpen, onToggle, onMove, onArchive, onDelete, canUp, canDown, onSave }) => {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    title: t.title,
    due_days_after_lesson: t.due_days_after_lesson,
    body_markdown: t.body_markdown || '',
  });
  const [editorKey, setEditorKey] = useState(0);
  useEffect(() => {
    setDraft({
      title: t.title,
      due_days_after_lesson: t.due_days_after_lesson,
      body_markdown: t.body_markdown || '',
    });
    setEditorKey((k) => k + 1);
  }, [t.id, t.updated_at]);

  const save = async (patch) => {
    setBusy(true);
    try {
      await onSave(t.id, patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="border border-kotoba-text/10 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2 bg-kotoba-background/30">
        <button type="button" onClick={onToggle} className="flex-grow text-left min-w-0">
          <p className="font-medium text-kotoba-primary truncate">{t.title}</p>
          <p className="text-[10px] text-kotoba-text/50">
            Due {t.due_days_after_lesson} day{t.due_days_after_lesson === 1 ? '' : 's'} after the lesson
          </p>
        </button>
        <button type="button" onClick={() => onMove(-1)} disabled={!canUp} className="text-sm px-2 py-1 text-kotoba-text/50 hover:text-kotoba-primary disabled:opacity-30">↑</button>
        <button type="button" onClick={() => onMove(1)} disabled={!canDown} className="text-sm px-2 py-1 text-kotoba-text/50 hover:text-kotoba-primary disabled:opacity-30">↓</button>
        <button type="button" onClick={onToggle} className="text-xs px-3 py-1 rounded-md border border-kotoba-primary text-kotoba-primary hover:bg-kotoba-primary hover:text-white">
          {isOpen ? 'Close' : 'Edit'}
        </button>
        <button type="button" onClick={() => onArchive(t)} className="text-xs text-kotoba-text/60 hover:text-kotoba-text">Archive</button>
        <button type="button" onClick={() => onDelete(t)} className="text-xs text-red-600 hover:underline">Delete</button>
      </div>

      {isOpen && (
        <div className="px-3 py-3 space-y-3 bg-white border-t border-kotoba-text/10">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Title</label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                onBlur={(e) => e.target.value !== t.title && save({ title: e.target.value })}
                className="w-full px-3 py-2 border border-kotoba-text/15 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Due (days after lesson)</label>
              <input
                type="number"
                min="0"
                max="365"
                value={draft.due_days_after_lesson}
                onChange={(e) => setDraft((d) => ({ ...d, due_days_after_lesson: parseInt(e.target.value, 10) || 0 }))}
                onBlur={(e) => save({ due_days_after_lesson: parseInt(e.target.value, 10) || 0 })}
                className="w-24 px-3 py-2 border border-kotoba-text/15 rounded text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Instructions</label>
            <MarkdownEditor
              key={`hw-${t.id}-${editorKey}`}
              initialMarkdown={draft.body_markdown}
              enableVocab={false}
              minHeight={180}
              placeholder="What the student needs to do. Be specific about expected output and how you'll grade."
              onChange={({ markdown }) => setDraft((d) => ({ ...d, body_markdown: markdown }))}
            />
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={() => save({ body_markdown: draft.body_markdown })} disabled={busy} className="px-4 py-2 rounded-md bg-kotoba-primary text-white text-sm font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save instructions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
};

const LessonHomeworkSection = ({ curriculumId, lessonId }) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/curriculum/${curriculumId}/lessons/${lessonId}/homework`);
      setItems(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load homework.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [lessonId]);

  const create = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await client.post(`/curriculum/${curriculumId}/lessons/${lessonId}/homework`, { title });
      setItems((prev) => [...prev, res.data]);
      setNewTitle('');
      setOpenId(res.data.id);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not add.'), 'error');
    } finally {
      setAdding(false);
    }
  };

  const save = async (id, patch) => {
    try {
      const res = await client.patch(`/curriculum/${curriculumId}/lessons/${lessonId}/homework/${id}`, patch);
      setItems((prev) => prev.map((x) => (x.id === id ? res.data : x)));
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not save.'), 'error');
    }
  };

  const archive = async (t) => {
    const ok = await confirm({
      title: 'Archive homework template',
      message: `Archive "${t.title}"? Students who've already been assigned this homework keep their assignments — only future deliveries skip it.`,
      confirmText: 'Archive',
      destructive: false,
    });
    if (!ok) return;
    try {
      await client.delete(`/curriculum/${curriculumId}/lessons/${lessonId}/homework/${t.id}`);
      setItems((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not archive.'), 'error');
    }
  };

  const hardDelete = async (t) => {
    const ok = await confirm({
      title: 'Delete homework template permanently',
      message: `Delete "${t.title}" from this lesson? Students who've already been assigned this homework keep their assignments. This can't be undone.`,
      confirmText: 'Delete forever',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/curriculum/${curriculumId}/lessons/${lessonId}/homework/${t.id}/permanent`);
      setItems((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not delete.'), 'error');
    }
  };

  const move = async (idx, delta) => {
    const target = idx + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next);
    try {
      await client.post(`/curriculum/${curriculumId}/lessons/${lessonId}/homework/reorder`, {
        template_ids: next.map((t) => t.id),
      });
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not reorder.'), 'error');
      load();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-base font-bold text-kotoba-text">Homework templates</h3>
        <p className="text-xs text-kotoba-text/60">Auto-assigns to the student when you mark this lesson taught</p>
      </div>

      {loading ? (
        <p className="text-xs text-kotoba-text/60">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-kotoba-text/60 italic mb-3">No homework attached yet. Add one if you want it to flow automatically when you teach this lesson.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {items.map((t, idx) => (
            <TemplateRow
              key={t.id}
              t={t}
              isOpen={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              onMove={(d) => move(idx, d)}
              onArchive={archive}
              onDelete={hardDelete}
              canUp={idx > 0}
              canDown={idx < items.length - 1}
              onSave={save}
            />
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-grow min-w-[180px]">
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">New homework title</label>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Practise the alphabet"
            className="w-full px-3 py-2 border border-kotoba-text/15 rounded text-sm"
          />
        </div>
        <button type="button" onClick={create} disabled={adding || !newTitle.trim()} className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold text-sm hover:bg-kotoba-secondary-dark disabled:opacity-50">
          {adding ? 'Adding…' : '+ Add homework'}
        </button>
      </div>
    </div>
  );
};

export default LessonHomeworkSection;
