import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Lists the tutor's assignments with quick visibility into submissions.
// Click an assignment with a submission to read it and (for short-answer
// or override cases) post a final grade + feedback.

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
};

const SubmissionGrader = ({ assignment, onSaved, onClose }) => {
  const [score, setScore] = useState(assignment.submission_score ?? 0);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await client.post(`/tutor/homework/submissions/${assignment.submission_id}/grade`, {
        manual_score: Number(score),
        feedback: feedback.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save the grade.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-kotoba-background/40 border border-kotoba-text/10 rounded-md p-3 mt-2 space-y-2">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded text-xs">
          {error}
        </div>
      )}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            Final score
          </label>
          <input
            type="number"
            min={0}
            max={assignment.max_score}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="w-20 px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <span className="ml-2 text-xs text-kotoba-text/60">/ {assignment.max_score}</span>
        </div>
        <div className="flex-grow min-w-[200px]">
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            Feedback for the student
          </label>
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="A short note (optional)"
            className="w-full px-3 py-1.5 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="px-4 py-1.5 rounded-md bg-kotoba-primary text-white text-sm font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save grade'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm text-kotoba-text/60 hover:text-kotoba-text"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const HomeworkAssignmentsManager = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [grading, setGrading] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/homework/assignments');
      setItems(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load assignments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Homework assignments</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  const needsReview = items.filter((a) => a.submission_needs_review);
  const submittedGraded = items.filter(
    (a) => a.submission_id && !a.submission_needs_review
  );
  const open = items.filter((a) => !a.submission_id);

  const Section = ({ title, list }) => {
    if (list.length === 0) return null;
    return (
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-kotoba-text/60 mb-2">
          {title}
        </h3>
        <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
          {list.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-grow">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-kotoba-text">{a.title}</span>
                    <span className="text-xs text-kotoba-text/60">
                      · {a.student_name || `student #${a.student_user_id}`}
                    </span>
                    {a.submission_needs_review && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-kotoba-secondary/30 text-kotoba-text">
                        Needs review
                      </span>
                    )}
                    {a.submission_id && !a.submission_needs_review && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-kotoba-primary/15 text-kotoba-primary">
                        {a.submission_score}/{a.max_score}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-kotoba-text/60 mt-1">
                    Assigned {formatDate(a.assigned_at)}
                    {a.submission_submitted_at && ` · submitted ${formatDate(a.submission_submitted_at)}`}
                  </p>
                </div>
                {a.submission_id && (
                  <button
                    type="button"
                    onClick={() => setGrading(grading?.id === a.id ? null : a)}
                    className="text-sm text-kotoba-primary hover:underline"
                  >
                    {grading?.id === a.id ? 'Close' : a.submission_needs_review ? 'Grade' : 'Adjust grade'}
                  </button>
                )}
              </div>
              {grading?.id === a.id && (
                <SubmissionGrader
                  assignment={a}
                  onSaved={() => { setGrading(null); load(); }}
                  onClose={() => setGrading(null)}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-kotoba-primary">Homework assignments</h2>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Everything you've assigned, grouped by stage. Auto-graded submissions land in "Graded" automatically; short answers come to "Needs review".
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No assignments yet. They appear here as soon as you assign one from a template — or as soon as you complete a lesson where you have an auto-assign template enabled.
        </p>
      ) : (
        <>
          <Section title="Needs your review" list={needsReview} />
          <Section title="Open (not submitted)" list={open} />
          <Section title="Submitted + graded" list={submittedGraded} />
        </>
      )}
    </section>
  );
};

export default HomeworkAssignmentsManager;
