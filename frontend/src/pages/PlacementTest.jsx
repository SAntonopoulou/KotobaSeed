import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { apexUrl } from '../hooks/useTenant';

// Public take-the-placement-test page on a tutor subdomain. Students who
// aren't logged in get redirected to /login first; the redirect carries
// them back here. Post-submit, shows their score + suggested level band
// + a clear CTA back to the tutor's site to book.

const PlacementTest = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [tutor, setTutor] = useState(null);
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [tutorRes, testRes] = await Promise.all([
          client.get('/tutor/me'),
          client.get('/tutor/placement-test/public'),
        ]);
        setTutor(tutorRes.data || null);
        setTest(testRes.data || null);
      } catch (err) {
        setError(err?.response?.data?.detail || 'Could not load this page.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    if (!token) {
      const next = encodeURIComponent(window.location.pathname);
      navigate(`/login?next=${next}`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await client.post('/tutor/placement-test/submit', { answers });
      setResult(res.data);
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

  if (!test?.is_available) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-kotoba-primary mb-2">
            Not available
          </h1>
          <p className="text-kotoba-text">
            {tutor?.display_name || 'This tutor'} hasn't set up a placement test yet.
          </p>
          <Link to="/" className="mt-4 inline-block text-kotoba-primary hover:underline">
            ← Back to their site
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-kotoba-background min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a
              href={apexUrl('/')}
              className="text-xs uppercase tracking-wider text-kotoba-text/50 hover:text-kotoba-primary"
            >
              Kotobaseed
            </a>
            <span className="text-kotoba-text/30">·</span>
            <Link to="/" className="text-xl font-semibold text-kotoba-primary hover:underline">
              {tutor?.display_name || 'Tutor'}
            </Link>
          </div>
          <Link to="/" className="text-sm text-kotoba-text/70 hover:text-kotoba-primary">
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <header>
          <h1 className="text-3xl font-extrabold text-kotoba-primary">{test.title}</h1>
          {test.description && (
            <p className="mt-2 text-kotoba-text whitespace-pre-line">{test.description}</p>
          )}
          <p className="mt-2 text-sm text-kotoba-text/60">
            {test.questions.length} {test.questions.length === 1 ? 'question' : 'questions'} · {test.max_score} pts max
          </p>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}

        {result ? (
          <section className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-sm uppercase tracking-wider text-kotoba-text/60">Your score</p>
            <p className="mt-2 text-5xl font-extrabold text-kotoba-primary">
              {result.auto_score} / {result.max_score}
            </p>
            <p className="mt-1 text-kotoba-text/70">{result.percent}%</p>
            {result.level_label && (
              <div className="mt-4">
                <p className="text-sm text-kotoba-text/70">Suggested level</p>
                <p className="mt-1 text-2xl font-bold text-kotoba-primary">{result.level_label}</p>
              </div>
            )}
            <p className="mt-6 text-kotoba-text">
              {tutor?.display_name || 'Your tutor'} will tailor lessons to where you are. Ready to start?
            </p>
            <Link
              to="/#book"
              className="mt-4 inline-block px-6 py-3 rounded-lg bg-kotoba-secondary text-kotoba-text font-bold hover:bg-kotoba-secondary-dark"
            >
              Book a lesson
            </Link>
          </section>
        ) : (
          <>
            {test.questions.map((q, idx) => (
              <section
                key={q.id}
                className="bg-white rounded-xl shadow-sm p-5 border border-kotoba-text/10"
              >
                <p className="text-xs uppercase tracking-wider text-kotoba-text/60 mb-1">
                  Question {idx + 1} · {q.points} {q.points === 1 ? 'pt' : 'pts'}
                </p>
                <p className="text-kotoba-text font-medium mb-3 whitespace-pre-line">{q.prompt}</p>

                {q.type === 'mc_single' && (
                  <div className="space-y-2">
                    {q.options.map((opt, i) => {
                      const isPicked = answers[q.id] === i;
                      return (
                        <label
                          key={i}
                          className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer ${
                            isPicked
                              ? 'border-kotoba-primary bg-kotoba-primary/5'
                              : 'border-kotoba-text/10 hover:border-kotoba-primary/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            checked={isPicked}
                            onChange={() => setAnswer(q.id, i)}
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.type === 'mc_multi' && (
                  <div className="space-y-2">
                    {q.options.map((opt, i) => {
                      const chosen = (answers[q.id] || []).includes(i);
                      return (
                        <label
                          key={i}
                          className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer ${
                            chosen
                              ? 'border-kotoba-primary bg-kotoba-primary/5'
                              : 'border-kotoba-text/10 hover:border-kotoba-primary/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={chosen}
                            onChange={() => toggleMulti(q.id, i)}
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.type === 'fill_blank' && (
                  <input
                    type="text"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    placeholder="Your answer"
                    className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                  />
                )}

                {q.type === 'short_answer' && (
                  <textarea
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    rows={3}
                    placeholder="Your answer"
                    className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                  />
                )}
              </section>
            ))}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="px-6 py-3 rounded-lg bg-kotoba-secondary text-kotoba-text font-bold hover:bg-kotoba-secondary-dark disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : token ? 'See my level' : 'Sign in & submit'}
              </button>
            </div>
            {!token && (
              <p className="text-xs text-kotoba-text/60 text-right">
                Sign in or create a free account so {tutor?.display_name || 'your tutor'} can see your result.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default PlacementTest;
