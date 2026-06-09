import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { tutorSiteUrl } from '../../hooks/useTenant';
import { getErrorMessage } from '../../utils/errors';
import { formatDateShort } from '../../utils/dates';
import Avatar from '../../components/Avatar';

// "My Tutors" — every tutor the student has booked with, with quick
// access to the tutor's site and a Message button. Drives the existing
// `/conversations/with/{user_id}` find-or-create endpoint so a single
// click jumps the student into a conversation (existing or fresh).

const Tutors = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/users/me/tutors');
        if (!cancelled) setRows(res.data || []);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your tutors.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const message = async (tutor) => {
    try {
      const res = await client.post(`/conversations/with/${tutor.user_id}`);
      const cid = res?.data?.conversation_id;
      if (cid) window.location.href = `/messages/${cid}`;
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start the conversation.'));
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-kotoba-primary">My tutors</h1>
        <p className="mt-1 text-sm text-kotoba-text/70">
          Every tutor you've booked with. Open their site, message them, or
          jump back into your most recent thread.
        </p>
      </header>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-kotoba-text/60">Loading…</p>
      ) : rows.length === 0 ? (
        <section className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-kotoba-text/70">
            You haven't booked any lessons yet.
          </p>
          <Link
            to="/library"
            className="mt-4 inline-block px-5 py-2 rounded-md bg-kotoba-primary text-white font-medium hover:bg-kotoba-primary/90"
          >
            Find a tutor
          </Link>
        </section>
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li
              key={t.tutor_id}
              className="bg-white rounded-2xl shadow-sm p-5 flex items-start gap-4"
            >
              <Avatar src={t.photo_url} name={t.display_name} size={64} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
                  <h2 className="text-lg font-semibold text-kotoba-text">
                    {t.display_name}
                  </h2>
                  {t.languages_taught && (
                    <span className="text-xs text-kotoba-text/60">
                      teaches {t.languages_taught}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-kotoba-text/60">
                  {t.completed_bookings} completed · {t.upcoming_bookings} upcoming
                  {t.next_lesson_at ? (
                    <>
                      {' '}
                      · next lesson{' '}
                      <span className="font-medium text-kotoba-text/80">
                        {formatDateShort(t.next_lesson_at)}
                      </span>
                    </>
                  ) : null}
                </p>
                {t.bio && (
                  <p className="mt-2 text-sm text-kotoba-text/80 line-clamp-2">
                    {t.bio}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <a
                  href={tutorSiteUrl(t.tutor_slug, '/')}
                  className="text-sm px-3 py-1.5 rounded-md bg-kotoba-primary text-white font-medium text-center hover:bg-kotoba-primary/90"
                >
                  Open site
                </a>
                <button
                  type="button"
                  onClick={() => message(t)}
                  className="text-sm px-3 py-1.5 rounded-md border border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary/5"
                >
                  Message
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};

export default Tutors;
