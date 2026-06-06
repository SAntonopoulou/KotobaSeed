import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';

// Student take-quiz + view-results page. Loads the assignment from the
// student endpoint. Pre-submit the response has questions WITHOUT correct
// answers (server strips them); post-submit it includes them so we can
// show what was right alongside what the student wrote.

const TakeAssignment = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get(`/users/me/assignments/${id}`);
      setAssignment(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load this assignment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAnswer = (qid, value) => setAnswers((prev) => ({ ...prev, [qid]: value }));

  const toggleMulti = (qid, idx) => {
    setAnswers((prev) => {
      const current = new Set(prev[qid] || []);
      if (current.has(idx)) current.delete(idx);
      else current.add(idx);
      return { ...prev, [qid]: [...current].sort((a, b) => a - b) };
    });
  };

  const submit = async () => {
    if (!window.confirm('Submit your answers? This is final — you can\'t take it again.')) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await client.post(
        `/users/me/assignments/${id}/submit`,
        { answers }
      );
      setAssignment(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not submit.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kotoba-background">
        <p className="text-kotoba-text">Loading…</p>
      </div>
    );
  }

  if (error && !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kotoba-background p-4">
        <div className="bg-white rounded-2xl shadow p-6 max-w-md text-center">
          <h1 className="text-xl font-bold text-kotoba-primary mb-2">Hmm</h1>
          <p className="text-kotoba-text">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/student/assignments')}
            className="mt-4 text-kotoba-primary hover:underline"
          >
            ← Back to homework
          </button>
        </div>
      </div>
    );
  }

  const submitted = Boolean(assignment.submission_id);
  const per = assignment.submission_per_question || {};
  const awaitingPayment = Boolean(assignment.submission_awaiting_payment);
  const creditBalance = assignment.credit_balance ?? 0;
  const gradingPriceCents = assignment.grading_price_cents ?? 0;
  const formatGradingPrice = () => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: (assignment.grading_currency || 'eur').toUpperCase(),
      }).format(gradingPriceCents / 100);
    } catch {
      return `€${(gradingPriceCents / 100).toFixed(2)}`;
    }
  };

  const useCredit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await client.post(`/users/me/assignments/${id}/use-grading-credit`);
      setAssignment(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not use credit.');
    } finally {
      setSubmitting(false);
    }
  };

  const payForGrading = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await client.post(`/users/me/assignments/${id}/grading-checkout`);
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setError('Could not start payment.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not start payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-kotoba-background min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/student/assignments" className="text-sm text-kotoba-text/70 hover:text-kotoba-primary">
            ← Back to homework
          </Link>
          <span className="text-xs text-kotoba-text/60">
            {assignment.tutor_display_name && `From ${assignment.tutor_display_name}`}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <header>
          <h1 className="text-3xl font-extrabold text-kotoba-primary">{assignment.title}</h1>
          {assignment.description && (
            <p className="mt-2 text-kotoba-text whitespace-pre-line">{assignment.description}</p>
          )}
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}

        {submitted && awaitingPayment && (
          <section className="bg-kotoba-secondary/30 border border-kotoba-secondary rounded-2xl p-6">
            <p className="text-sm uppercase tracking-wider text-kotoba-text/70 font-medium">
              Grading pending
            </p>
            <p className="mt-1 text-kotoba-text">
              Your short answer needs a human review. {assignment.tutor_display_name || 'Your tutor'} charges <strong>{formatGradingPrice()}</strong> per grading. Spend a credit or pay to send it to them.
            </p>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={useCredit}
                disabled={submitting || creditBalance <= 0}
                className="px-5 py-2.5 rounded-lg bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
              >
                {creditBalance > 0 ? `Use 1 credit (${creditBalance} left)` : 'No credits available'}
              </button>
              <button
                type="button"
                onClick={payForGrading}
                disabled={submitting}
                className="px-5 py-2.5 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
              >
                {submitting ? 'Loading…' : `Pay ${formatGradingPrice()}`}
              </button>
            </div>
            <p className="mt-3 text-xs text-kotoba-text/60">
              Your auto-graded score so far: {assignment.submission_score ?? 0} / {assignment.submission_max_score ?? assignment.max_score}. The short-answer points get added once your tutor reviews.
            </p>
          </section>
        )}

        {submitted && !awaitingPayment && (
          <section className="bg-kotoba-primary/10 rounded-2xl p-6">
            <p className="text-sm uppercase tracking-wider text-kotoba-primary/80 font-medium">Your score</p>
            <p className="mt-1 text-3xl font-extrabold text-kotoba-primary">
              {assignment.submission_score ?? '—'} / {assignment.submission_max_score ?? assignment.max_score}
            </p>
            {assignment.submission_feedback && (
              <div className="mt-3 text-sm text-kotoba-text">
                <p className="font-semibold mb-1">From your tutor:</p>
                <p className="whitespace-pre-line">{assignment.submission_feedback}</p>
              </div>
            )}
            {assignment.status === 'submitted' && (
              <p className="mt-3 text-sm text-kotoba-text/70">
                Some questions need your tutor to review them. Your final score may change.
              </p>
            )}
          </section>
        )}

        {assignment.questions.map((q, idx) => {
          const result = per[q.id] || null;
          const cellTone = result
            ? result.correct
              ? 'border-kotoba-primary/30 bg-kotoba-primary/5'
              : result.needs_review
                ? 'border-kotoba-secondary/40 bg-kotoba-secondary/10'
                : 'border-red-200 bg-red-50'
            : 'border-kotoba-text/15 bg-white';
          return (
            <section
              key={q.id}
              className={`rounded-xl p-5 border ${cellTone}`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs uppercase tracking-wider text-kotoba-text/60">
                  Question {idx + 1} · {q.points} {q.points === 1 ? 'pt' : 'pts'}
                </p>
                {result && (
                  <span className="text-xs font-semibold">
                    {result.points_earned}/{result.points_possible}
                    {result.needs_review ? ' · pending review' : result.correct ? ' · correct' : ' · incorrect'}
                  </span>
                )}
              </div>
              <p className="text-kotoba-text font-medium mb-3 whitespace-pre-line">{q.prompt}</p>

              {q.type === 'mc_single' && (
                <div className="space-y-2">
                  {q.options.map((opt, i) => {
                    const isAnswer = answers[q.id] === i;
                    const isCorrect = q.correct === i;
                    return (
                      <label
                        key={i}
                        className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer ${
                          submitted
                            ? isCorrect
                              ? 'border-kotoba-primary bg-kotoba-primary/10'
                              : isAnswer
                                ? 'border-red-300 bg-red-50'
                                : 'border-kotoba-text/10'
                            : isAnswer
                              ? 'border-kotoba-primary bg-kotoba-primary/5'
                              : 'border-kotoba-text/10 hover:border-kotoba-primary/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={isAnswer}
                          onChange={() => setAnswer(q.id, i)}
                          disabled={submitted}
                          className="text-kotoba-primary"
                        />
                        <span className="text-kotoba-text">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {q.type === 'mc_multi' && (
                <div className="space-y-2">
                  {q.options.map((opt, i) => {
                    const chosen = (answers[q.id] || []).includes(i);
                    const isCorrect = (q.correct || []).includes(i);
                    return (
                      <label
                        key={i}
                        className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer ${
                          submitted
                            ? isCorrect
                              ? 'border-kotoba-primary bg-kotoba-primary/10'
                              : chosen
                                ? 'border-red-300 bg-red-50'
                                : 'border-kotoba-text/10'
                            : chosen
                              ? 'border-kotoba-primary bg-kotoba-primary/5'
                              : 'border-kotoba-text/10 hover:border-kotoba-primary/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={chosen}
                          onChange={() => toggleMulti(q.id, i)}
                          disabled={submitted}
                          className="text-kotoba-primary"
                        />
                        <span className="text-kotoba-text">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {q.type === 'fill_blank' && (
                <div>
                  <input
                    type="text"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    disabled={submitted}
                    placeholder="Your answer"
                    className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                  />
                  {submitted && q.accepted_answers && (
                    <p className="mt-2 text-xs text-kotoba-text/70">
                      Accepted answer{q.accepted_answers.length > 1 ? 's' : ''}: {q.accepted_answers.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {q.type === 'short_answer' && (
                <textarea
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  disabled={submitted}
                  rows={4}
                  placeholder="Your answer"
                  className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                />
              )}
            </section>
          );
        })}

        {!submitted && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="px-6 py-3 rounded-lg bg-kotoba-secondary text-kotoba-text font-bold hover:bg-kotoba-secondary-dark disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit answers'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default TakeAssignment;
