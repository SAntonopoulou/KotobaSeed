import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import QuestionBuilder, { makeQuestion } from './homework/QuestionBuilder';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

// Tutor-side template CRUD. Inline editor — for v1 we keep templates
// modest enough that an inline form works better than a dedicated route.

const HomeworkTemplatesManager = () => {
  const confirm = useConfirm();
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // One-off "assign this template to a student" dialog state. Replaces
  // the legacy blanket auto-assign flow Sophia retired 2026-06-09.
  const [assigningTemplate, setAssigningTemplate] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [assignForm, setAssignForm] = useState({ student_user_id: '', due_days: 7 });
  const [assignBusy, setAssignBusy] = useState(false);

  useEffect(() => {
    if (!assigningTemplate) return;
    setStudentsLoading(true);
    setAssignForm({ student_user_id: '', due_days: 7 });
    (async () => {
      try {
        const res = await client.get('/tutor/students');
        setStudents(res.data || []);
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load your students.'));
      } finally {
        setStudentsLoading(false);
      }
    })();
  }, [assigningTemplate]);

  const submitAssign = async (e) => {
    e.preventDefault();
    if (!assignForm.student_user_id) return;
    setAssignBusy(true);
    try {
      const dueDays = parseInt(assignForm.due_days, 10) || 0;
      const due_at = dueDays > 0
        ? new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString()
        : null;
      await client.post('/tutor/homework/assignments', {
        template_id: assigningTemplate.id,
        student_user_id: parseInt(assignForm.student_user_id, 10),
        due_at,
      });
      setInfo(`Assigned "${assigningTemplate.title}" to the student.`);
      setAssigningTemplate(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not assign.'));
    } finally {
      setAssignBusy(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/homework/templates');
      setTemplates(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load templates.'));
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
      is_premium: false,
      price_cents: 0,
      currency: 'eur',
      grading_price_cents: 0,
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
        // Force the legacy auto-assign-after-every-lesson flag off on
        // every save. The toggle was removed from the UI 2026-06-09;
        // any templates still carrying it from before now get cleared
        // on next edit. Curriculum lessons are the new auto-assign path.
        auto_assign_on_lesson_complete: false,
        is_premium: editing.is_premium,
        price_cents: editing.is_premium ? editing.price_cents : 0,
        currency: editing.currency || 'eur',
        grading_price_cents: editing.grading_price_cents || 0,
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
      setError(getErrorMessage(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t) => {
    if (!(await confirm({
      title: 'Archive template',
      message: `Archive the template "${t.title}"? Existing assignments keep their snapshots; you can still see them in the assignments list.`,
      confirmText: 'Archive',
      destructive: false,
    }))) return;
    setBusy(true);
    try {
      await client.delete(`/tutor/homework/templates/${t.id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not archive.'));
    } finally {
      setBusy(false);
    }
  };

  const hardDelete = async (t) => {
    if (!(await confirm({
      title: 'Delete template permanently',
      message: `Delete "${t.title}" permanently? Already-issued assignments keep their content but lose the link to this template. This can't be undone.`,
      confirmText: 'Delete forever',
      destructive: true,
    }))) return;
    setBusy(true);
    try {
      await client.delete(`/tutor/homework/templates/${t.id}/permanent`);
      await load();
      setInfo('Template deleted.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete.'));
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
            Build reusable assignments — multiple choice, fill-blank with accent normalization, and short-answer questions you grade yourself. Assign a template to a specific student one-off here, or attach it to a curriculum lesson so it auto-spawns when you teach that lesson to that student.
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

          {/* The legacy "auto-assign after every completed lesson"
              checkbox was removed 2026-06-09. Auto-assignment now lives
              on curriculum lessons: attach this template's content to a
              lesson via Dashboard → Content → Curriculums and it
              auto-spawns only for the student you teach the lesson to. */}

          <div className="border-t border-kotoba-text/10 pt-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.is_premium || false}
                onChange={(e) =>
                  setEditing({ ...editing, is_premium: e.target.checked })
                }
                disabled={busy}
                className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded"
              />
              <span>Sell this as premium homework</span>
            </label>
            {editing.is_premium && (
              <div className="mt-2 flex items-center gap-2 max-w-xs">
                <span className="text-sm text-kotoba-text/70">Price €</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(editing.price_cents || 0) / 100}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      price_cents: Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)),
                    })
                  }
                  disabled={busy}
                  className="w-32 px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                />
                <span className="text-xs text-kotoba-text/60">
                  Platform fee 10/7/5/0% by tier
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-kotoba-text/10 pt-3">
            <p className="text-sm font-medium text-kotoba-text mb-1">Per-grading fee</p>
            <p className="text-xs text-kotoba-text/60 mb-2">
              When a homework has short-answer questions you need to grade yourself, charge per submission. Subscribers spend a monthly credit instead (set on your subscription plan). 0 = free grading.
            </p>
            <div className="flex items-center gap-2 max-w-xs">
              <span className="text-sm text-kotoba-text/70">€</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={(editing.grading_price_cents || 0) / 100}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    grading_price_cents: Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)),
                  })
                }
                disabled={busy}
                className="w-32 px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
              <span className="text-xs text-kotoba-text/60">per grading</span>
            </div>
          </div>

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
                  {/* Legacy "Auto-assign" badge removed 2026-06-09 with
                      the auto_assign_on_lesson_complete option. */}
                  {!t.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded bg-kotoba-text/10 text-kotoba-text/60">
                      Archived
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {t.is_active && (
                  <button
                    type="button"
                    onClick={() => setAssigningTemplate(t)}
                    className="text-sm font-semibold text-kotoba-primary hover:bg-kotoba-primary hover:text-white border border-kotoba-primary rounded-md px-3 py-1"
                  >
                    Assign to student
                  </button>
                )}
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
                    className="text-sm text-kotoba-text/60 hover:text-kotoba-text"
                  >
                    Archive
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => hardDelete(t)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {assigningTemplate && (
        <div className="fixed inset-0 z-50 bg-kotoba-text/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={submitAssign} className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div>
              <h3 className="font-display text-xl font-bold text-kotoba-primary">Assign homework</h3>
              <p className="text-xs text-kotoba-text/60 mt-1">
                Sends "<strong>{assigningTemplate.title}</strong>" to one student. They'll see it in their assignments queue immediately.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Student</label>
              {studentsLoading ? (
                <p className="text-sm text-kotoba-text/60">Loading your students…</p>
              ) : students.length === 0 ? (
                <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-3">
                  You have no enrolled students yet. Students are added automatically when they book a lesson with you. Once you have a student, come back here to assign homework one-off.
                </p>
              ) : (
                <select
                  value={assignForm.student_user_id}
                  onChange={(e) => setAssignForm((f) => ({ ...f, student_user_id: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm"
                >
                  <option value="">— Pick a student —</option>
                  {students.map((s) => (
                    <option key={s.enrollment_id} value={s.student_user_id}>{s.student_name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Due in (days)</label>
              <input
                type="number"
                min="0"
                max="365"
                value={assignForm.due_days}
                onChange={(e) => setAssignForm((f) => ({ ...f, due_days: e.target.value }))}
                className="w-32 px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
              <p className="text-[10px] text-kotoba-text/55 mt-1">Set 0 for no fixed due date.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAssigningTemplate(null)} disabled={assignBusy} className="px-4 py-2 text-sm text-kotoba-text/70 hover:text-kotoba-text">
                Cancel
              </button>
              <button type="submit" disabled={assignBusy || students.length === 0 || !assignForm.student_user_id} className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50">
                {assignBusy ? 'Sending…' : 'Assign now'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

export default HomeworkTemplatesManager;
