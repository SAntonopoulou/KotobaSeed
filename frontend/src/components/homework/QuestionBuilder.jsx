import React from 'react';

// Reusable question editor — handles all four supported types. Each
// question has stable id (string), type, prompt, points, plus type-
// specific fields. The parent owns the questions array; this component
// just calls onChange with the updated question.

const TYPE_LABELS = {
  mc_single: 'Multiple choice (one answer)',
  mc_multi: 'Multiple choice (several answers)',
  fill_blank: 'Fill in the blank',
  short_answer: 'Short answer (you grade)',
};

const blankFor = (type) => {
  const base = { type, prompt: '', points: 1 };
  if (type === 'mc_single') return { ...base, options: ['', ''], correct: 0 };
  if (type === 'mc_multi') return { ...base, options: ['', ''], correct: [] };
  if (type === 'fill_blank') {
    return {
      ...base,
      accepted_answers: [''],
      case_sensitive: false,
      normalize_accents: true,
    };
  }
  if (type === 'short_answer') return { ...base };
  return base;
};

export const makeQuestion = (type) => ({
  id: `q${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  ...blankFor(type),
});

const OptionsEditor = ({ question, onChange, multi }) => {
  const setOption = (idx, value) => {
    const next = [...question.options];
    next[idx] = value;
    onChange({ ...question, options: next });
  };
  const addOption = () => onChange({ ...question, options: [...question.options, ''] });
  const removeOption = (idx) => {
    if (question.options.length <= 2) return;
    const next = question.options.filter((_, i) => i !== idx);
    let nextCorrect = question.correct;
    if (multi) {
      nextCorrect = (question.correct || [])
        .filter((c) => c !== idx)
        .map((c) => (c > idx ? c - 1 : c));
    } else if (question.correct === idx) {
      nextCorrect = 0;
    } else if (question.correct > idx) {
      nextCorrect = question.correct - 1;
    }
    onChange({ ...question, options: next, correct: nextCorrect });
  };
  const toggleCorrect = (idx) => {
    if (multi) {
      const current = new Set(question.correct || []);
      if (current.has(idx)) current.delete(idx);
      else current.add(idx);
      onChange({ ...question, correct: [...current].sort((a, b) => a - b) });
    } else {
      onChange({ ...question, correct: idx });
    }
  };
  return (
    <div className="space-y-2">
      {question.options.map((opt, idx) => {
        const isCorrect = multi
          ? (question.correct || []).includes(idx)
          : question.correct === idx;
        return (
          <div key={idx} className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs">
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={`q-${question.id}-correct`}
                checked={isCorrect}
                onChange={() => toggleCorrect(idx)}
                className="text-kotoba-primary"
              />
              correct
            </label>
            <input
              type="text"
              value={opt}
              onChange={(e) => setOption(idx, e.target.value)}
              placeholder={`Option ${idx + 1}`}
              className="flex-grow px-2 py-1 border border-kotoba-text/15 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
            <button
              type="button"
              onClick={() => removeOption(idx)}
              disabled={question.options.length <= 2}
              className="text-kotoba-text/40 hover:text-red-600 text-lg leading-none disabled:opacity-30"
              aria-label="Remove option"
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addOption}
        className="text-sm text-kotoba-primary hover:underline"
      >
        + Add option
      </button>
    </div>
  );
};

const AcceptedAnswersEditor = ({ question, onChange }) => {
  const setAccepted = (idx, value) => {
    const next = [...question.accepted_answers];
    next[idx] = value;
    onChange({ ...question, accepted_answers: next });
  };
  const addAccepted = () =>
    onChange({ ...question, accepted_answers: [...question.accepted_answers, ''] });
  const removeAccepted = (idx) => {
    if (question.accepted_answers.length <= 1) return;
    onChange({
      ...question,
      accepted_answers: question.accepted_answers.filter((_, i) => i !== idx),
    });
  };
  return (
    <div className="space-y-2">
      {question.accepted_answers.map((ans, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={ans}
            onChange={(e) => setAccepted(idx, e.target.value)}
            placeholder={`Accepted answer ${idx + 1}`}
            className="flex-grow px-2 py-1 border border-kotoba-text/15 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <button
            type="button"
            onClick={() => removeAccepted(idx)}
            disabled={question.accepted_answers.length <= 1}
            className="text-kotoba-text/40 hover:text-red-600 text-lg leading-none disabled:opacity-30"
            aria-label="Remove accepted answer"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addAccepted}
        className="text-sm text-kotoba-primary hover:underline"
      >
        + Add accepted answer
      </button>
      <div className="flex gap-4 mt-2 text-xs">
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={question.normalize_accents !== false}
            onChange={(e) => onChange({ ...question, normalize_accents: e.target.checked })}
          />
          Ignore accents (γειά = γεια)
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={question.case_sensitive === true}
            onChange={(e) => onChange({ ...question, case_sensitive: e.target.checked })}
          />
          Case-sensitive
        </label>
      </div>
    </div>
  );
};

const QuestionCard = ({ question, index, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) => {
  const updateField = (field, value) => onChange({ ...question, [field]: value });
  return (
    <div className="border border-kotoba-text/15 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-kotoba-text/40">Q{index + 1}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-kotoba-primary/10 text-kotoba-primary font-medium">
            {TYPE_LABELS[question.type] || question.type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-kotoba-text/40 hover:text-kotoba-text disabled:opacity-30 text-sm px-1"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-kotoba-text/40 hover:text-kotoba-text disabled:opacity-30 text-sm px-1"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-kotoba-text/40 hover:text-red-600 text-lg leading-none px-1"
            aria-label="Remove question"
          >
            ×
          </button>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Prompt</label>
        <input
          type="text"
          value={question.prompt}
          onChange={(e) => updateField('prompt', e.target.value)}
          placeholder="What's the question?"
          className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
        />
      </div>

      {(question.type === 'mc_single' || question.type === 'mc_multi') && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Options</label>
          <OptionsEditor
            question={question}
            onChange={onChange}
            multi={question.type === 'mc_multi'}
          />
        </div>
      )}

      {question.type === 'fill_blank' && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Accepted answers</label>
          <AcceptedAnswersEditor question={question} onChange={onChange} />
        </div>
      )}

      {question.type === 'short_answer' && (
        <p className="text-xs text-kotoba-text/60 mb-3">
          The student types an answer, you grade it. Set the max points below.
        </p>
      )}

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-kotoba-text/70">Points</label>
        <input
          type="number"
          min={1}
          max={100}
          value={question.points}
          onChange={(e) => updateField('points', Math.max(1, parseInt(e.target.value || '1', 10)))}
          className="w-20 px-2 py-1 border border-kotoba-text/15 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
        />
      </div>
    </div>
  );
};

const QuestionBuilder = ({ questions, onChange }) => {
  const updateAt = (idx, q) => {
    const next = [...questions];
    next[idx] = q;
    onChange(next);
  };
  const removeAt = (idx) => onChange(questions.filter((_, i) => i !== idx));
  const move = (idx, delta) => {
    const next = [...questions];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const add = (type) => onChange([...questions, makeQuestion(type)]);

  return (
    <div className="space-y-3">
      {questions.length === 0 && (
        <p className="text-sm text-kotoba-text/60 bg-kotoba-background/40 rounded-md p-4">
          No questions yet. Add your first one below.
        </p>
      )}
      {questions.map((q, idx) => (
        <QuestionCard
          key={q.id}
          question={q}
          index={idx}
          onChange={(nq) => updateAt(idx, nq)}
          onRemove={() => removeAt(idx)}
          onMoveUp={() => move(idx, -1)}
          onMoveDown={() => move(idx, 1)}
          canMoveUp={idx > 0}
          canMoveDown={idx < questions.length - 1}
        />
      ))}
      <div className="flex flex-wrap gap-2 pt-2">
        <span className="text-sm text-kotoba-text/70 self-center mr-2">Add question:</span>
        <button
          type="button"
          onClick={() => add('mc_single')}
          className="px-3 py-1.5 text-sm rounded-md border border-kotoba-text/15 hover:border-kotoba-primary hover:bg-kotoba-primary/5"
        >
          Multiple choice (one)
        </button>
        <button
          type="button"
          onClick={() => add('mc_multi')}
          className="px-3 py-1.5 text-sm rounded-md border border-kotoba-text/15 hover:border-kotoba-primary hover:bg-kotoba-primary/5"
        >
          Multiple choice (several)
        </button>
        <button
          type="button"
          onClick={() => add('fill_blank')}
          className="px-3 py-1.5 text-sm rounded-md border border-kotoba-text/15 hover:border-kotoba-primary hover:bg-kotoba-primary/5"
        >
          Fill in the blank
        </button>
        <button
          type="button"
          onClick={() => add('short_answer')}
          className="px-3 py-1.5 text-sm rounded-md border border-kotoba-text/15 hover:border-kotoba-primary hover:bg-kotoba-primary/5"
        >
          Short answer
        </button>
      </div>
    </div>
  );
};

export default QuestionBuilder;
