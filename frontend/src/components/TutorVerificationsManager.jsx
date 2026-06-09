import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

// Tutor dashboard panel — submit + manage verification credentials. Three
// kinds:
//   - language_proficiency: DELE C2, JLPT N1, native-speaker certs
//   - teaching_credential : CELTA, DELTA, degree
//   - identity           : auto-granted by Stripe Connect KYC (not user-submittable)
//
// Pro+ only — Free tutors get a 402 from the backend, the panel shows the
// upgrade nudge.

const KIND_LABEL = {
  language_proficiency: 'Language proficiency',
  teaching_credential: 'Teaching credential',
  identity: 'Identity (Stripe)',
};

const KIND_HELPER = {
  language_proficiency: 'DELE C2, JLPT N1, native-speaker certificate, etc.',
  teaching_credential: 'CELTA, DELTA, degree in education, etc.',
};

const STATUS_TONE = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

const TutorVerificationsManager = () => {
  const confirm = useConfirm();
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    kind: 'language_proficiency',
    description: '',
    language: '',
    evidence_file_path: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/tutor/verifications');
      setRows(res.data || []);
      setGated(false);
    } catch (err) {
      if (err?.response?.status === 402) {
        setGated(true);
      } else {
        setError(getErrorMessage(err, 'Could not load verifications.'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.description.trim()) {
      setError('Add a short description (what credential is this?).');
      return;
    }
    if (form.kind === 'language_proficiency' && !form.language.trim()) {
      setError('Pick the language this credential covers.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await client.post('/tutor/verifications', {
        kind: form.kind,
        description: form.description.trim(),
        language: form.language.trim() || null,
        evidence_file_path: form.evidence_file_path.trim() || null,
      });
      addToast({ message: 'Submitted for review.', type: 'success' });
      setForm({
        kind: 'language_proficiency',
        description: '',
        language: '',
        evidence_file_path: '',
      });
      setAdding(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not submit.'));
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async (row) => {
    if (
      !(await confirm({
        title: 'Withdraw credential',
        message: `Withdraw "${row.description}"? This removes it from your record.`,
        confirmText: 'Withdraw',
        destructive: true,
      }))
    )
      return;
    try {
      await client.delete(`/tutor/verifications/${row.id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not withdraw.'));
    }
  };

  if (loading) return <SkeletonCard />;

  if (gated) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-kotoba-primary">Verified credentials</h2>
        <p className="text-sm text-kotoba-text/70">
          Show DELE / CELTA / native-speaker badges on your public site. Upgrade to Pro to enable.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Verified credentials</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Badges shown on your public site. We review each submission within a few business days.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
          >
            + Add credential
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {adding && (
        <form
          onSubmit={submit}
          className="border border-kotoba-text/15 rounded-lg p-4 bg-kotoba-background/20 space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Kind</label>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            >
              <option value="language_proficiency">Language proficiency</option>
              <option value="teaching_credential">Teaching credential</option>
            </select>
            <p className="text-xs text-kotoba-text/60 mt-1">{KIND_HELPER[form.kind]}</p>
          </div>
          {form.kind === 'language_proficiency' && (
            <div>
              <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Language</label>
              <input
                type="text"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                placeholder="e.g. Greek, Japanese, Spanish"
                className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="DELE C2, CELTA from Cambridge, etc."
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
              Evidence (link to PDF, Drive, your own site)
            </label>
            <input
              type="url"
              value={form.evidence_file_path}
              onChange={(e) => setForm({ ...form, evidence_file_path: e.target.value })}
              placeholder="https://…"
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
            <p className="text-xs text-kotoba-text/60 mt-1">
              Optional but speeds up review. Anything our team can open in a browser.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-kotoba-text/10">
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={submitting}
              className="px-4 py-2 text-sm text-kotoba-text/60 hover:text-kotoba-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
        </form>
      )}

      {rows.length === 0 && !adding ? (
        <p className="text-sm text-kotoba-text/70 bg-kotoba-background/40 rounded-md p-4">
          No credentials yet. Add your first — DELE, CELTA, native-speaker certificate, etc.
        </p>
      ) : (
        <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-kotoba-primary">{row.description}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_TONE[row.status] || 'bg-kotoba-text/10 text-kotoba-text/70'}`}
                  >
                    {row.status}
                  </span>
                </div>
                <p className="text-xs text-kotoba-text/60 mt-0.5">
                  {KIND_LABEL[row.kind] || row.kind}
                  {row.language ? ` · ${row.language}` : ''}
                  {row.evidence_file_path ? (
                    <>
                      {' · '}
                      <a
                        href={row.evidence_file_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-kotoba-primary hover:underline"
                      >
                        Evidence
                      </a>
                    </>
                  ) : null}
                </p>
                {row.review_notes && (
                  <p className="text-xs text-kotoba-text/70 mt-1 italic">
                    Admin note: {row.review_notes}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => withdraw(row)}
                className="text-sm text-red-600 hover:underline"
              >
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default TutorVerificationsManager;
