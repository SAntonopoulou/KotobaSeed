import React, { useEffect, useState } from 'react';
import client from '../api/client';
import QuestionBuilder, { makeQuestion } from './homework/QuestionBuilder';

// Tutor's single placement test + the optional level bands that map
// percentage → suggested CEFR-style label. Public URL is /placement-test
// on the tutor's subdomain — show it in your bio / link to it from your
// own landing copy.

const DEFAULT_BANDS = [
  { min_percent: 80, label: 'B2 / advanced beginner' },
  { min_percent: 50, label: 'A2 / intermediate beginner' },
  { min_percent: 0, label: 'A1 / starting out' },
];

const PlacementTestManager = () => {
  const [test, setTest] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([
        client.get('/tutor/placement-test'),
        client.get('/tutor/placement-submissions'),
      ]);
      setTest(t.data);
      setSubmissions(s.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load the placement test.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = () => {
    if (test?.id) {
      setEditing({ ...test });
    } else {
      setEditing({
        id: null,
        title: 'Placement test',
        description: '',
        questions: [makeQuestion('mc_single')],
        level_bands: [...DEFAULT_BANDS],
        is_active: true,
      });
    }
    setError('');
    setInfo('');
  };

  const cancel = () => {
    setEditing(null);
    setError('');
  };

  const updateBand = (idx, key, value) => {
    const next = [...editing.level_bands];
    next[idx] = { ...next[idx], [key]: value };
    setEditing({ ...editing, level_bands: next });
  };
  const addBand = () =>
    setEditing({
      ...editing,
      level_bands: [...editing.level_bands, { min_percent: 0, label: '' }],
    });
  const removeBand = (idx) =>
    setEditing({
      ...editing,
      level_bands: editing.level_bands.filter((_, i) => i !== idx),
    });

  const save = async () => {
    if (!editing.title.trim()) { setError('Add a title.'); return; }
    if (editing.questions.length === 0) { setError('Add at least one question.'); return; }
    for (const q of editing.questions) {
      if (!q.prompt?.trim()) { setError('Every question needs a prompt.'); return; }
    }
    for (const b of editing.level_bands) {
      if (!b.label?.trim()) { setError('Every band needs a label.'); return; }
      const pct = Number(b.min_percent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setError('Band thresholds must be 0..100.'); return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        title: editing.title.trim(),
        description: editing.description?.trim() || null,
        questions: editing.questions,
        level_bands: editing.level_bands.map((b) => ({
          min_percent: parseInt(b.min_percent, 10),
          label: b.label.trim(),
        })),
      };
      await client.put('/tutor/placement-test', payload);
      setInfo('Saved.');
      cancel();
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Take down the placement test? Existing submissions stay in your history.')) return;
    setBusy(true);
    try {
      await client.delete('/tutor/placement-test');
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not remove.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Placement test</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Placement test</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            A short test on your site that gives prospective students an instant level guess. Lives at <code className="font-mono text-xs">/placement-test</code> on your site — link to it from your bio.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
          >
            {test?.id ? 'Edit test' : '+ Create test'}
          </button>
        )}
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

      {editing ? (
        <div className="border border-kotoba-text/15 rounded-lg p-4 bg-kotoba-background/20 space-y-4">
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
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Description (shown to students before they start)</label>
            <textarea
              value={editing.description || ''}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={2}
              disabled={busy}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-kotoba-text mb-2">Questions</h3>
            <QuestionBuilder
              questions={editing.questions}
              onChange={(qs) => setEditing({ ...editing, questions: qs })}
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-kotoba-text mb-2">Level bands</h3>
            <p className="text-xs text-kotoba-text/60 mb-2">
              When a student finishes, we show them the highest band whose threshold their score meets. Leave empty to skip the suggestion.
            </p>
            <div className="space-y-2">
              {editing.level_bands.map((band, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={band.min_percent}
                    onChange={(e) => updateBand(idx, 'min_percent', e.target.value)}
                    disabled={busy}
                    className="w-20 px-2 py-1 border border-kotoba-text/15 rounded text-sm"
                  />
                  <span className="text-sm text-kotoba-text/60">% →</span>
                  <input
                    type="text"
                    value={band.label}
                    onChange={(e) => updateBand(idx, 'label', e.target.value)}
                    placeholder="e.g. A2"
                    disabled={busy}
                    className="flex-grow px-2 py-1 border border-kotoba-text/15 rounded text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeBand(idx)}
                    className="text-kotoba-text/40 hover:text-red-600 text-lg"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addBand}
                className="text-sm text-kotoba-primary hover:underline"
              >
                + Add band
              </button>
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
              {busy ? 'Saving…' : 'Save test'}
            </button>
          </div>
        </div>
      ) : test?.id && test.is_active ? (
        <div className="border border-kotoba-text/10 rounded-md p-4 bg-kotoba-background/30">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div>
              <p className="font-medium text-kotoba-text">{test.title}</p>
              <p className="text-xs text-kotoba-text/60">
                {test.questions.length} {test.questions.length === 1 ? 'question' : 'questions'} · {test.max_score} pts · {test.level_bands.length} bands
              </p>
            </div>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-sm text-red-600 hover:underline"
            >
              Take down
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No placement test set up. A 5-minute quiz is a great way to give students confidence that you'll teach to their level.
        </p>
      )}

      {submissions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-kotoba-text/60 mb-2">
            Recent submissions
          </h3>
          <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
            {submissions.slice(0, 10).map((s) => (
              <li key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium text-kotoba-text">
                    {s.student_name || s.student_email || `Student #${s.student_user_id}`}
                  </p>
                  <p className="text-xs text-kotoba-text/60">
                    {new Date(s.submitted_at).toLocaleString()}
                    {s.student_email && s.student_name ? ` · ${s.student_email}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {s.level_label && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-kotoba-secondary/30 text-kotoba-text">
                      {s.level_label}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-kotoba-primary/15 text-kotoba-primary">
                    {s.auto_score}/{s.max_score} · {s.percent}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default PlacementTestManager;
