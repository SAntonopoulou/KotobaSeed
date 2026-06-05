import React, { useEffect, useState } from 'react';
import client from '../api/client';
import QuestionBuilder, { makeQuestion } from './homework/QuestionBuilder';

// Tutor-side template CRUD. Inline editor — for v1 we keep templates
// modest enough that an inline form works better than a dedicated route.

const HomeworkTemplatesManager = () => {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/homework/templates');
      setTemplates(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startCompose = () =>
    setEditing({
      id: null,
      title: '',
      description: '',
      questions: [makeQuestion('mc_single')],
      auto_assign_on_lesson_complete: false,
    });

  const startEdit = (t) => setEditing({ ...t });

  const cancel = () => {
    setEditing(null);
    setError('');
    setInfo('');
  };

  const save = async () => {
    if (!editing.title.trim()) {
      setError('Add a title.');
      return;
    }
    if (editing.questions.length === 0) {
      setError('Add at least one question.');
      return;
    }
    for (const q of editing.questions) {
      if (!q.prompt?.trim()) {
        setError('Every question needs a prompt.');
        return;
      }
      if (q.type === 'mc_single' || q.type === 'mc_multi') {
        if (q.options.some((o) => !o.trim())) {
          setError(`Question "${q.prompt}" has an empty option.`);
          return;
        }
        if (q.type === 'mc_multi' && (q.correct || []).length === 0) {
          setError(`Question "${q.prompt}" needs at least one correct answer.`);
          return;
        }
      }
      if (q.type === 'fill_blank' && q.accepted_answers.some((a) => !a.trim())) {
        setError(`Question "${q.prompt}" has an empty accepted answer.`);
        return;
      }
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const payload = {
        title: editing.title.trim(),
        description: editing.description?.trim() || null,
        questions: editing.questions,
        auto_assign_on_lesson_complete: editing.auto_assign_on_lesson_complete,
      };
      if (editing.id) {
        await client.patch(`/tutor/homework/templates/${editing.id}`, payload);
      } else {
        await client.post('/tutor/homework/templates', payload);
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

  const remove = async (t) => {
    if (!window.confirm(`Archive the template "${t.title}"? Existing assignments keep their snapshots.`)) return;
    setBusy(true);
    try {
      await client.delete(`/tutor/homework/templates/${t.id}`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not archive.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Homework templates</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Build reusable assignments — multiple choice, fill-blank with accent normalization, and short-answer questions you grade yourself. Flag one as "auto-assign" and it goes out automatically after every completed lesson.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startCompose}
            className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
          >
            + New template
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm mb-3">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm mb-3">
          {info}
        </div>
      )}

      {editing && (
        <div className="border border-kotoba-text/15 rounded-lg p-4 mb-4 bg-kotoba-background/20 space-y-4">
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
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Description (optional)</label>
            <textarea
              value={editing.description || ''}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={2}
              disabled={busy}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>

          <QuestionBuilder
            questions={editing.questions}
            onChange={(questions) => setEditing({ ...editing, questions })}
          />

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editing.auto_assign_on_lesson_complete}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  auto_assign_on_lesson_complete: e.target.checked,
                })
              }
              disabled={busy}
              className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded"
            />
            Auto-assign this after every completed lesson
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-kotoba-text/10">
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="px-4 py-2 text-sm text-kotoba-text/60 hover:text-kotoba-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : editing.id ? 'Save changes' : 'Save template'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No templates yet. Build one — a quick after-class drill is the best place to start.
        </p>
      ) : (
        <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
          {templates.map((t) => (
            <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="font-medium text-kotoba-primary hover:underline text-left"
                  >
                    {t.title}
                  </button>
                  <span className="text-xs px-2 py-0.5 rounded bg-kotoba-background text-kotoba-text/70">
                    {t.questions.length} {t.questions.length === 1 ? 'question' : 'questions'} · {t.max_score} pts
                  </span>
                  {t.auto_assign_on_lesson_complete && (
                    <span className="text-xs px-2 py-0.5 rounded bg-kotoba-secondary/30 text-kotoba-text">
                      Auto-assign
                    </span>
                  )}
                  {!t.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded bg-kotoba-text/10 text-kotoba-text/60">
                      Archived
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(t)}
                  className="text-sm text-kotoba-primary hover:underline"
                >
                  Edit
                </button>
                {t.is_active && (
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Archive
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

export default HomeworkTemplatesManager;
