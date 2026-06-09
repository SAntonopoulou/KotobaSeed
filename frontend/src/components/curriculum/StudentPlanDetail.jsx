import React, { useEffect, useState } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ModalContext';
import { getErrorMessage } from '../../utils/errors';

// Per-student plan editor. Lets a tutor:
//   - assign one of their curriculums to a student
//   - switch to a fully custom plan and add lessons from any curriculum
//   - clone an existing student's plan onto this one
//   - mark the current lesson taught (auto-spawns homework templates)
//   - leave private notes about the student

const StudentPlanDetail = ({ plan, onClose }) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(plan);
  const [curriculums, setCurriculums] = useState([]);
  const [allLessons, setAllLessons] = useState([]);
  const [otherPlans, setOtherPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(plan.notes || '');

  const loadAll = async () => {
    try {
      const [cur, plans, fresh] = await Promise.all([
        client.get('/curriculum'),
        client.get('/lesson-plans'),
        client.get(`/lesson-plans/${plan.student_user_id}`),
      ]);
      setCurriculums(cur.data || []);
      setOtherPlans((plans.data || []).filter((p) => p.student_user_id !== plan.student_user_id));
      setData(fresh.data);
      setNotes(fresh.data.notes || '');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load.'), 'error');
    }
  };

  const loadLessonsForCustom = async () => {
    try {
      const cur = await client.get('/curriculum');
      const allLessonsFromMyCurriculums = [];
      for (const c of cur.data || []) {
        const ls = await client.get(`/curriculum/${c.id}/lessons`);
        for (const l of ls.data || []) {
          allLessonsFromMyCurriculums.push({ ...l, curriculum_title: c.title });
        }
      }
      setAllLessons(allLessonsFromMyCurriculums);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load lessons.'), 'error');
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [plan.student_user_id]);
  useEffect(() => {
    if (data?.is_custom) loadLessonsForCustom();
    // eslint-disable-next-line
  }, [data?.is_custom]);

  const setCurriculum = async (curriculum_id) => {
    setBusy(true);
    try {
      const res = await client.put(`/lesson-plans/${plan.student_user_id}`, {
        curriculum_id,
        notes,
        reset_position: true,
      });
      setData(res.data);
      addToast('Curriculum set.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not save.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const switchToCustom = async () => {
    setBusy(true);
    try {
      const res = await client.put(`/lesson-plans/${plan.student_user_id}`, {
        curriculum_id: null,
        notes,
        reset_position: true,
      });
      setData(res.data);
      addToast('Switched to custom plan.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not switch.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const addCustomItem = async (lesson_id) => {
    setBusy(true);
    try {
      const res = await client.post(`/lesson-plans/${plan.student_user_id}/items`, {
        lesson_id,
      });
      setData(res.data);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not add lesson.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const clonePlan = async (source_student_user_id) => {
    setBusy(true);
    try {
      const res = await client.post(
        `/lesson-plans/${plan.student_user_id}/clone-from/${source_student_user_id}`,
      );
      setData(res.data);
      addToast('Plan cloned.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not clone.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const markTaught = async () => {
    if (!data.next_lesson) return;
    setBusy(true);
    try {
      const res = await client.post('/lesson-plans/deliveries', {
        student_user_id: plan.student_user_id,
        lesson_id: data.next_lesson.lesson_id,
        advance_plan: true,
      });
      const hwCount = (res.data?.homework_assignment_ids || []).length;
      addToast(
        hwCount
          ? `Lesson marked taught — ${hwCount} homework auto-assigned.`
          : 'Lesson marked taught.',
        'success',
      );
      loadAll();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not record delivery.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const deletePlan = async () => {
    const ok = await confirm({
      title: 'Delete this student’s plan',
      message: `Delete the plan for ${data.student_name || data.student_email || 'this student'}? Curriculum links + delivery history for this plan will be removed. The student themselves is not deleted.`,
      confirmText: 'Delete forever',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await client.delete(`/lesson-plans/${plan.student_user_id}/permanent`);
      addToast('Plan deleted.', 'success');
      onClose();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not delete.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    setBusy(true);
    try {
      await client.put(`/lesson-plans/${plan.student_user_id}`, {
        curriculum_id: data.curriculum_id,
        notes,
        reset_position: false,
      });
      addToast('Notes saved.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not save notes.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button type="button" onClick={onClose} className="text-xs font-semibold text-kotoba-text/60 hover:text-kotoba-primary">
          ← Back to plans
        </button>
        <button type="button" onClick={deletePlan} disabled={busy} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
          Delete plan
        </button>
      </div>

      <div>
        <h2 className="text-xl font-bold text-kotoba-primary">
          {data.student_name || data.student_email || `Student #${data.student_user_id}`}
        </h2>
        <p className="text-sm text-kotoba-text/60">{data.student_email}</p>
      </div>

      {data.next_lesson ? (
        <div className="rounded-xl bg-kotoba-secondary/15 border border-kotoba-secondary/40 px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-kotoba-secondary-dark">Next up</p>
            <p className="mt-1 font-bold text-kotoba-primary text-lg">{data.next_lesson.lesson_title}</p>
            <p className="text-xs text-kotoba-text/60">
              {data.current_position + 1} of {data.lessons.length} · ~{data.next_lesson.estimated_duration_minutes} min
            </p>
          </div>
          <button
            type="button"
            onClick={markTaught}
            disabled={busy}
            className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Mark this lesson taught'}
          </button>
        </div>
      ) : data.lessons.length === 0 ? (
        <div className="rounded-xl bg-kotoba-text/[0.03] border border-kotoba-text/10 px-5 py-4 text-sm text-kotoba-text/70">
          No lessons in this plan yet. Pick a curriculum below or switch to a custom plan and add lessons.
        </div>
      ) : (
        <div className="rounded-xl bg-kotoba-primary/[0.05] border border-kotoba-primary/15 px-5 py-4 text-sm text-kotoba-text/80">
          All planned lessons delivered. Pick a new curriculum or extend the plan.
        </div>
      )}

      <div>
        <h3 className="text-base font-bold text-kotoba-text mb-2">Curriculum</h3>
        <p className="text-xs text-kotoba-text/60 mb-3">
          {data.is_custom
            ? 'This is a custom plan — pick lessons from any of your curriculums.'
            : `Following ${data.curriculum_title || 'no curriculum'}.`}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={data.curriculum_id || ''}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) switchToCustom();
              else setCurriculum(parseInt(v, 10));
            }}
            disabled={busy}
            className="px-3 py-2 border border-kotoba-text/15 rounded text-sm"
          >
            <option value="">— Custom plan —</option>
            {curriculums.map((c) => (
              <option key={c.id} value={c.id}>{c.title}{c.level ? ` · ${c.level}` : ''}</option>
            ))}
          </select>
          {otherPlans.length > 0 && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) clonePlan(parseInt(e.target.value, 10)); }}
              disabled={busy}
              className="px-3 py-2 border border-kotoba-text/15 rounded text-sm"
            >
              <option value="">Clone from another student…</option>
              {otherPlans.map((p) => (
                <option key={p.id} value={p.student_user_id}>
                  {p.student_name || p.student_email || `Student #${p.student_user_id}`}
                  {p.curriculum_title ? ` — ${p.curriculum_title}` : ' — custom'}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {data.lessons.length > 0 && (
        <div>
          <h3 className="text-base font-bold text-kotoba-text mb-2">Plan lessons</h3>
          <ol className="space-y-2">
            {data.lessons.map((l, idx) => (
              <li
                key={l.lesson_id}
                className={`flex items-center gap-3 border rounded-md px-3 py-2 ${
                  idx === data.current_position
                    ? 'border-kotoba-primary bg-kotoba-primary/[0.04]'
                    : idx < data.current_position
                      ? 'border-kotoba-text/10 bg-kotoba-text/[0.02] opacity-70'
                      : 'border-kotoba-text/10'
                }`}
              >
                <span className="text-xs font-mono text-kotoba-text/40 w-6 text-center">{idx + 1}</span>
                <span className="flex-grow text-sm">{l.lesson_title}</span>
                <span className="text-xs text-kotoba-text/50">{l.estimated_duration_minutes} min</span>
                {idx < data.current_position && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-kotoba-primary">Taught</span>
                )}
                {idx === data.current_position && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-kotoba-secondary-dark">Next</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {data.is_custom && (
        <div>
          <h3 className="text-base font-bold text-kotoba-text mb-2">Add a lesson to this custom plan</h3>
          {allLessons.length === 0 ? (
            <p className="text-xs text-kotoba-text/60 italic">No lessons available — create a curriculum and add some lessons first.</p>
          ) : (
            <select
              value=""
              onChange={(e) => { if (e.target.value) addCustomItem(parseInt(e.target.value, 10)); }}
              disabled={busy}
              className="w-full px-3 py-2 border border-kotoba-text/15 rounded text-sm"
            >
              <option value="">Pick a lesson…</option>
              {allLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.curriculum_title} → {l.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div>
        <h3 className="text-base font-bold text-kotoba-text mb-2">Notes (private to you)</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What works with this student? What to remember next time?"
          className="w-full px-3 py-2 border border-kotoba-text/15 rounded text-sm"
        />
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={saveNotes} disabled={busy} className="px-4 py-2 rounded-md bg-kotoba-primary text-white text-sm font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save notes'}
          </button>
        </div>
      </div>
    </section>
  );
};

export default StudentPlanDetail;
