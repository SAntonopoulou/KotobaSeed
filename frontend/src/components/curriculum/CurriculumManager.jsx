import React, { useEffect, useState } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ModalContext';
import { getErrorMessage } from '../../utils/errors';
import { SkeletonCard } from '../Skeleton';
import CurriculumEditor from './CurriculumEditor';

// Top-level surface for the teacher's curriculum library. Shows a list
// of curriculums they own; selecting one opens the editor inline.
// Architecture lives in project_curriculum_system_plan memory.

const CEFR_LEVELS = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const NewCurriculumDialog = ({ open, onCreate, onCancel, busy }) => {
  const [form, setForm] = useState({ title: '', language: '', level: '', description: '' });
  useEffect(() => {
    if (open) setForm({ title: '', language: '', level: '', description: '' });
  }, [open]);
  if (!open) return null;
  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onCreate({
      title: form.title.trim(),
      language: form.language.trim() || null,
      level: form.level || null,
      description: form.description.trim() || null,
    });
  };
  return (
    <div className="fixed inset-0 z-50 bg-kotoba-text/40 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
        <h3 className="font-display text-xl font-bold text-kotoba-primary">New curriculum</h3>
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            autoFocus
            placeholder="e.g. Beginner Greek"
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Language</label>
            <input
              type="text"
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              placeholder="Greek"
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">CEFR level</label>
            <select
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
            >
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>{l || '— unspecified —'}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="What this curriculum covers, who it's for…"
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm text-kotoba-text/70 hover:text-kotoba-text">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create curriculum'}
          </button>
        </div>
      </form>
    </div>
  );
};

const CurriculumCard = ({ c, onOpen, onArchive, onDelete, busy }) => (
  <div className="rounded-xl border border-kotoba-text/10 bg-white hover:shadow-soft transition-shadow p-4 flex items-start justify-between gap-3">
    <button
      type="button"
      onClick={() => onOpen(c)}
      className="text-left flex-grow min-w-0"
    >
      <p className="font-bold text-kotoba-primary truncate">{c.title}</p>
      <p className="text-xs text-kotoba-text/60 mt-1">
        {c.lesson_count} lesson{c.lesson_count === 1 ? '' : 's'}
        {c.language && ` · ${c.language}`}
        {c.level && ` · ${c.level}`}
      </p>
      {c.description && (
        <p className="text-xs text-kotoba-text/70 mt-2 line-clamp-2">{c.description}</p>
      )}
    </button>
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => onArchive(c)}
        disabled={busy}
        className="text-xs text-kotoba-text/55 hover:text-kotoba-text px-2 py-1"
      >
        Archive
      </button>
      <button
        type="button"
        onClick={() => onDelete(c)}
        disabled={busy}
        className="text-xs text-red-600 hover:underline px-2 py-1"
      >
        Delete
      </button>
    </div>
  </div>
);

const CurriculumManager = () => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('mine'); // 'mine' | 'library'
  const [items, setItems] = useState([]);
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [mine, lib] = await Promise.all([
        client.get('/curriculum'),
        client.get('/curriculum/school-library').catch(() => ({ data: [] })),
      ]);
      setItems(mine.data || []);
      setLibrary(lib.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load curriculums.'));
    } finally {
      setLoading(false);
    }
  };

  const cloneFromLibrary = async (c) => {
    const ok = await confirm({
      title: 'Clone curriculum',
      message: `Add a copy of "${c.title}" to your own library? The copy is independent — your edits won't affect the original.`,
      confirmText: 'Clone',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await client.post(`/curriculum/${c.id}/clone`);
      addToast('Cloned to your library.', 'success');
      setItems((prev) => [res.data, ...prev]);
      setTab('mine');
      setOpenId(res.data.id);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not clone.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (payload) => {
    setBusy(true);
    try {
      const res = await client.post('/curriculum', payload);
      setShowNew(false);
      addToast('Curriculum created.', 'success');
      setItems((prev) => [res.data, ...prev]);
      setOpenId(res.data.id);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not create.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const archive = async (c) => {
    const ok = await confirm({
      title: 'Archive curriculum',
      message: `Archive "${c.title}"? Lessons stay in place and student delivery history is kept. You can find archived items later if needed.`,
      confirmText: 'Archive',
      destructive: false,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await client.delete(`/curriculum/${c.id}`);
      setItems((prev) => prev.filter((x) => x.id !== c.id));
      addToast('Archived.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not archive.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const hardDelete = async (c) => {
    const ok = await confirm({
      title: 'Delete curriculum permanently',
      message: `Delete "${c.title}" and ALL its lessons, attached homework templates, and student delivery history? Any student plans tied to it convert to custom plans. This can't be undone.`,
      confirmText: 'Delete forever',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await client.delete(`/curriculum/${c.id}/permanent`);
      setItems((prev) => prev.filter((x) => x.id !== c.id));
      addToast('Deleted.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not delete.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (openId !== null) {
    const item = items.find((x) => x.id === openId);
    return (
      <CurriculumEditor
        curriculum={item}
        onClose={() => { setOpenId(null); load(); }}
      />
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Curriculums</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Author lesson sequences your students walk through. Add rich text, images, embedded video, and PDFs. Homework templates auto-assign when you teach the lesson.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
        >
          + New curriculum
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => setTab('mine')}
          className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
            tab === 'mine'
              ? 'bg-kotoba-primary text-white'
              : 'bg-kotoba-text/[0.04] text-kotoba-text/70 hover:text-kotoba-primary'
          }`}
        >
          My curriculums
          <span className={`ml-1.5 text-[10px] ${tab === 'mine' ? 'opacity-80' : 'opacity-50'}`}>
            {items.length}
          </span>
        </button>
        {library.length > 0 && (
          <button
            type="button"
            onClick={() => setTab('library')}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
              tab === 'library'
                ? 'bg-kotoba-primary text-white'
                : 'bg-kotoba-text/[0.04] text-kotoba-text/70 hover:text-kotoba-primary'
            }`}
          >
            School library
            <span className={`ml-1.5 text-[10px] ${tab === 'library' ? 'opacity-80' : 'opacity-50'}`}>
              {library.length}
            </span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm mb-3">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : tab === 'mine' ? (
        items.length === 0 ? (
          <div className="text-center py-12 text-kotoba-text/60 border border-dashed border-kotoba-text/15 rounded-xl">
            <p>No curriculums yet.</p>
            <p className="text-xs mt-1">Click "New curriculum" to start building one — or check the School library tab if your school has shared anything.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {items.map((c) => (
              <CurriculumCard key={c.id} c={c} onOpen={() => setOpenId(c.id)} onArchive={archive} onDelete={hardDelete} busy={busy} />
            ))}
          </div>
        )
      ) : (
        library.length === 0 ? (
          <div className="text-center py-12 text-kotoba-text/60 border border-dashed border-kotoba-text/15 rounded-xl">
            <p>No school library curriculums yet.</p>
            <p className="text-xs mt-1">Teachers in your school can share a curriculum by ticking "Share with my school" inside that curriculum's editor.</p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {library.map((c) => (
              <li key={c.id} className="rounded-xl border border-kotoba-text/10 bg-white p-4 flex flex-col gap-2">
                <p className="font-bold text-kotoba-primary truncate">{c.title}</p>
                <p className="text-xs text-kotoba-text/60">
                  {c.lesson_count} lesson{c.lesson_count === 1 ? '' : 's'}
                  {c.language && ` · ${c.language}`}
                  {c.level && ` · ${c.level}`}
                </p>
                {c.description && (
                  <p className="text-xs text-kotoba-text/70 line-clamp-3">{c.description}</p>
                )}
                <div className="mt-auto pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => cloneFromLibrary(c)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-md bg-kotoba-secondary text-kotoba-text text-xs font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-50"
                  >
                    Clone to my library
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      <NewCurriculumDialog open={showNew} onCreate={create} onCancel={() => setShowNew(false)} busy={busy} />
    </section>
  );
};

export default CurriculumManager;
