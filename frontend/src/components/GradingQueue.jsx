import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Focused grading view: only submissions awaiting tutor review, oldest
// first. We deliberately show ONE submission expanded at a time so the
// tutor's attention stays on the work. Inline per-question display means
// no clicking through to a separate page.

const formatRelative = (iso) => {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffH = Math.round((now - then) / (1000 * 60 * 60));
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
};

const QuestionReview = ({ question, answer }) => (
  <div className="rounded-md border border-kotoba-text/10 bg-kotoba-background/30 p-3">
    <p className="text-sm font-medium text-kotoba-text">{question.prompt}</p>
    <div className="mt-2 text-sm text-kotoba-text/80">
      <span className="text-xs text-kotoba-text/50 uppercase mr-2">Student's answer:</span>
      {answer === undefined || answer === null || answer === '' ? (
        <em className="text-kotoba-text/40">(left blank)</em>
      ) : typeof answer === 'object' ? (
        <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">
          {JSON.stringify(answer, null, 2)}
        </pre>
      ) : (
        <span className="whitespace-pre-wrap">{String(answer)}</span>
      )}
    </div>
    {question.accepted_answers && (
      <p className="mt-2 text-xs text-kotoba-text/60">
        Reference: {question.accepted_answers.join(' / ')}
      </p>
    )}
  </div>
);

const GradingQueue = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [submissionDetails, setSubmissionDetails] = useState({});
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/homework/grading-queue');
      setItems(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load the grading queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAssignment = async (assignment) => {
    if (openId === assignment.id) {
      setOpenId(null);
      return;
    }
    setOpenId(assignment.id);
    setScore('');
    setFeedback('');
    setError('');
    setInfo('');
    if (!submissionDetails[assignment.submission_id]) {
      try {
        const res = await client.get(
          `/tutor/homework/submissions/${assignment.submission_id}`,
        );
        setSubmissionDetails((d) => ({ ...d, [assignment.submission_id]: res.data }));
      } catch {
        // Fall through with no answers loaded — the tutor still sees the
        // questions and can set a score manually.
      }
    }
  };

  const submit = async (assignment) => {
    const n = Number(score);
    if (!Number.isFinite(n) || n < 0 || n > assignment.max_score) {
      setError(`Score must be a number between 0 and ${assignment.max_score}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await client.post(
        `/tutor/homework/submissions/${assignment.submission_id}/grade`,
        {
          manual_score: n,
          feedback: feedback.trim() || null,
        },
      );
      setInfo('Grade saved.');
      setOpenId(null);
      setScore('');
      setFeedback('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save the grade.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Grading queue</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Grading queue</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Submissions waiting on your manual grade — oldest first.
          </p>
        </div>
        <span className="px-3 py-1 rounded-md bg-kotoba-secondary/30 text-kotoba-text text-sm font-medium">
          {items.length} waiting
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm">
          {info}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          Nothing waiting. When students submit homework that needs your eyes, it'll appear here.
        </div>
      ) : (
        <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
          {items.map((a) => {
            const isOpen = openId === a.id;
            const detail = submissionDetails[a.submission_id];
            const answers = detail?.answers_json
              ? (() => {
                  try {
                    return JSON.parse(detail.answers_json);
                  } catch {
                    return {};
                  }
                })()
              : {};
            const reviewable = a.questions.filter(
              (q) =>
                q.type === 'short_answer' ||
                q.type === 'translation' ||
                q.type === 'multi_blank'
            );
            return (
              <li key={a.id} className="px-3 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-grow">
                    <p className="font-medium text-kotoba-primary">
                      {a.title}
                      <span className="ml-2 text-xs text-kotoba-text/60">
                        · {a.student_name || 'Student'}
                      </span>
                    </p>
                    <p className="text-xs text-kotoba-text/60 mt-0.5">
                      Submitted {formatRelative(a.submission_submitted_at)} · auto-score{' '}
                      {a.submission_score ?? '—'} / {a.max_score}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAssignment(a)}
                    className="px-4 py-1.5 rounded-md border border-kotoba-primary text-kotoba-primary text-sm font-medium hover:bg-kotoba-primary hover:text-white"
                  >
                    {isOpen ? 'Close' : 'Grade'}
                  </button>
                </div>
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-kotoba-text/10 space-y-3">
                    {reviewable.length === 0 ? (
                      <p className="text-sm text-kotoba-text/70 italic">
                        No free-text questions — set a manual score below to override the autograde.
                      </p>
                    ) : (
                      reviewable.map((q) => (
                        <QuestionReview
                          key={q.id}
                          question={q}
                          answer={answers[String(q.id)]}
                        />
                      ))
                    )}
                    <div className="grid sm:grid-cols-[auto_1fr] gap-3 items-end pt-2">
                      <div>
                        <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
                          Final score (out of {a.max_score})
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={a.max_score}
                          value={score}
                          onChange={(e) => setScore(e.target.value)}
                          className="w-32 px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
                          Feedback (optional)
                        </label>
                        <textarea
                          rows={2}
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="Notes for the student"
                          className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => submit(a)}
                        disabled={busy}
                        className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
                      >
                        {busy ? 'Saving…' : 'Save grade'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default GradingQueue;
