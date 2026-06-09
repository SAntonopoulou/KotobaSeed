import React, { useEffect, useState } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../utils/errors';
import StudentPlanDetail from './StudentPlanDetail';

// Per-student lesson-plan tracker. Lists every active student plan
// for this tutor and shows "next up" at a glance. Click a row to open
// the full plan editor where the tutor can:
//   - pick the curriculum the student is on (or switch to custom)
//   - mark the current lesson as taught (auto-spawns homework)
//   - clone an existing student's plan

const StudentPlanCard = ({ plan, onOpen, onMark }) => (
  <li className="border border-kotoba-text/10 rounded-lg overflow-hidden bg-white">
    <div className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
      <button type="button" onClick={() => onOpen(plan)} className="text-left flex-grow min-w-0">
        <p className="font-bold text-kotoba-primary truncate">
          {plan.student_name || plan.student_email || `Student #${plan.student_user_id}`}
        </p>
        <p className="text-xs text-kotoba-text/60 mt-0.5">
          {plan.curriculum_title || (plan.is_custom ? 'Custom plan' : 'No curriculum set')}
        </p>
        {plan.next_lesson ? (
          <p className="text-sm text-kotoba-text mt-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-kotoba-secondary-dark">Next up</span>{' '}
            {plan.next_lesson.lesson_title}
            <span className="text-xs text-kotoba-text/50 ml-2">
              ({plan.current_position + 1} of {plan.lessons.length} · ~{plan.next_lesson.estimated_duration_minutes} min)
            </span>
          </p>
        ) : plan.lessons.length === 0 ? (
          <p className="text-xs text-kotoba-text/55 italic mt-2">No lessons yet. Open to assign a curriculum.</p>
        ) : (
          <p className="text-xs text-kotoba-primary mt-2">All planned lessons delivered — pick a new curriculum or extend the plan.</p>
        )}
      </button>
      <div className="flex items-center gap-2">
        {plan.next_lesson && (
          <button
            type="button"
            onClick={() => onMark(plan)}
            className="px-3 py-1.5 rounded-md bg-kotoba-secondary text-kotoba-text text-xs font-semibold hover:bg-kotoba-secondary-dark"
          >
            Mark taught
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpen(plan)}
          className="px-3 py-1.5 rounded-md border border-kotoba-primary text-kotoba-primary text-xs font-semibold hover:bg-kotoba-primary hover:text-white"
        >
          Open
        </button>
      </div>
    </div>
  </li>
);

const StudentPlansManager = () => {
  const { addToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/lesson-plans');
      setPlans(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load plans.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markTaught = async (plan) => {
    if (!plan.next_lesson) return;
    try {
      const res = await client.post('/lesson-plans/deliveries', {
        student_user_id: plan.student_user_id,
        lesson_id: plan.next_lesson.lesson_id,
        advance_plan: true,
      });
      const hwCount = (res.data?.homework_assignment_ids || []).length;
      addToast(
        hwCount
          ? `Lesson marked taught — ${hwCount} homework auto-assigned.`
          : 'Lesson marked taught.',
        'success',
      );
      load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not record delivery.'), 'error');
    }
  };

  if (openId !== null) {
    const plan = plans.find((p) => p.student_user_id === openId);
    if (plan) {
      return (
        <StudentPlanDetail
          plan={plan}
          onClose={() => { setOpenId(null); load(); }}
        />
      );
    }
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-kotoba-primary">Lesson plans</h2>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Track which curriculum each student is on and what's next. When you mark a lesson taught, any homework templates attached to it auto-assign to that student only.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-kotoba-text/60">Loading…</p>
      ) : plans.length === 0 ? (
        <div className="text-center py-12 text-kotoba-text/60 border border-dashed border-kotoba-text/15 rounded-xl">
          <p>No active plans yet.</p>
          <p className="text-xs mt-1">Plans are created the first time you open a student's record below — or as soon as a booking happens.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => (
            <StudentPlanCard
              key={p.id}
              plan={p}
              onOpen={() => setOpenId(p.student_user_id)}
              onMark={markTaught}
            />
          ))}
        </ul>
      )}
    </section>
  );
};

export default StudentPlansManager;
