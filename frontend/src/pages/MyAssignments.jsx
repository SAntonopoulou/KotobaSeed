import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

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

// Student's view: every assignment across every tutor they've worked with.
// Groups into Open / Submitted so the next action is obvious.

const MyAssignments = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/users/me/assignments');
        setItems(res.data || []);
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load your assignments.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kotoba-background">
        <p className="text-kotoba-text">Loading…</p>
      </div>
    );
  }

  const open = items.filter((a) => !a.submission_id);
  const done = items.filter((a) => a.submission_id);

  const Row = ({ a }) => (
    <li className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex-grow">
        <Link
          to={`/student/assignments/${a.id}`}
          className="font-medium text-kotoba-primary hover:underline"
        >
          {a.title}
        </Link>
        <p className="text-xs text-kotoba-text/60 mt-1">
          {a.tutor_display_name ? `From ${a.tutor_display_name}` : ''}
          {' · '}assigned {formatDate(a.assigned_at)}
          {a.due_at && ` · due ${formatDate(a.due_at)}`}
        </p>
      </div>
      {a.submission_id ? (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-kotoba-primary/15 text-kotoba-primary">
          {a.submission_score ?? '—'}/{a.submission_max_score ?? a.max_score}
        </span>
      ) : (
        <Link
          to={`/student/assignments/${a.id}`}
          className="px-3 py-1.5 rounded-md bg-kotoba-secondary text-kotoba-text text-sm font-semibold hover:bg-kotoba-secondary-dark"
        >
          Start
        </Link>
      )}
    </li>
  );

  return (
    <div className="bg-kotoba-background min-h-screen">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <header>
          <h1 className="text-3xl font-extrabold text-kotoba-primary">My homework</h1>
          <p className="mt-2 text-kotoba-text/80">
            Assignments your tutors have shared with you.
          </p>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {items.length === 0 && !error && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-kotoba-text/70">
              You don't have any homework right now. They'll show up here as soon as your tutor assigns one.
            </p>
          </div>
        )}

        {open.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-kotoba-primary mb-3">Open</h2>
            <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
              {open.map((a) => <Row key={a.id} a={a} />)}
            </ul>
          </section>
        )}

        {done.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-kotoba-primary mb-3">Submitted</h2>
            <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
              {done.map((a) => <Row key={a.id} a={a} />)}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
};

export default MyAssignments;
