import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaStar, FaRegStar } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

// VassoReviews — themed `/reviews` page. Renders every published
// testimonial for this tenant in the same card style as the landing,
// plus a gated submission form for eligible students.
//
// Gate (server-enforced — duplicated here for UX so the form only
// surfaces when the student can actually post):
//   1. Authenticated viewer (not the tutor themselves)
//   2. ≥1 booking with this tutor where status=COMPLETED and the
//      lesson pack is NOT a free trial
//   3. Has not already submitted a review for this tutor
//
// Submitted reviews land as is_published=false and the tutor approves
// them from their dashboard.

const AVATAR_COLORS = [
  '#7fb5e6', '#e8b84b', '#7e944f', '#dc6a3f', '#0f5fa6', '#c99a2e',
];

const VassoReviews = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState(null);
  const [eligibility, setEligibility] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      client.get('/testimonials').then((r) => r.data).catch(() => []),
      client.get('/testimonials/eligibility').then((r) => r.data).catch(() => null),
    ]).then(([list, elig]) => {
      if (cancelled) return;
      setReviews(Array.isArray(list) ? list : []);
      setEligibility(elig);
    });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  return (
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="Reviews — Learn Greek with Vasso"
    >
      <main className="content-wide">
        <p className="eyebrow-inline">Loved by learners</p>
        <h1 className="pt">From first <span className="gr">γεια σου</span> to real conversations</h1>
        <p className="pt-sub">
          A few words from students around the world.
        </p>

        {error && <p className="form-error">{error}</p>}
        {reviews === null && <div className="empty">Loading…</div>}
        {reviews && reviews.length === 0 && !error && (
          <div className="empty">No published reviews yet — be the first.</div>
        )}

        {reviews && reviews.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 22,
          }}>
            {reviews.map((t, i) => (
              <figure className="reviewcard" key={t.id || i}>
                <div className="stars">
                  {Array.from({ length: Math.max(1, Math.min(5, t.rating || 5)) }).map((_, k) => (
                    <FaStar key={k} size={16} />
                  ))}
                </div>
                <blockquote>{t.body}</blockquote>
                <figcaption>
                  <span
                    className="av"
                    style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                  >
                    {(t.student_name || 'A').charAt(0)}
                  </span>
                  <span className="meta">
                    <b>{t.student_name || 'A student'}</b>
                    {t.location && <small>{t.location}</small>}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <ReviewSubmissionPanel
          tutor={tutor}
          currentUser={currentUser}
          eligibility={eligibility}
          onSubmitted={(row) => {
            setEligibility((prev) => ({
              ...(prev || { eligible: true }),
              already_submitted: true,
              reason: prev?.reason || "Your review is on the way — the tutor will publish it shortly.",
            }));
            // We don't push into reviews because pending rows aren't
            // visible until the tutor approves — keep behaviour
            // consistent with the public list.
            void row;
          }}
        />
      </main>
    </VassoLayout>
  );
};

const ReviewSubmissionPanel = ({ tutor, currentUser, eligibility, onSubmitted }) => {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [name, setName] = useState(
    currentUser?.full_name || ''
  );
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (eligibility === null) return null;

  const intro = (
    <p className="eyebrow-inline" style={{ marginBottom: 14 }}>
      Leave a review
    </p>
  );

  if (!currentUser) {
    return (
      <section
        className="panel panel-pad"
        style={{ marginTop: 40, textAlign: 'center' }}
      >
        {intro}
        <p style={{ margin: '0 0 14px', color: 'var(--fg-muted)', fontSize: 15 }}>
          Sign in to share how your lessons with {(tutor?.display_name || 'Vasso').split(/\s+/)[0]} have gone.
        </p>
        <Link
          to={`/login?next=${encodeURIComponent('/reviews')}`}
          className="v-btn v-btn-primary"
        >
          Sign in
        </Link>
      </section>
    );
  }

  if (success || eligibility.already_submitted) {
    return (
      <section className="panel panel-pad" style={{ marginTop: 40 }}>
        {intro}
        <p className="form-note" style={{ marginBottom: 0 }}>
          {success
            ? 'Thanks for leaving a review — it goes live once the tutor approves it.'
            : eligibility.reason || 'Your review is on the way.'}
        </p>
      </section>
    );
  }

  if (!eligibility.eligible) {
    return (
      <section className="panel panel-pad" style={{ marginTop: 40 }}>
        {intro}
        <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 15 }}>
          {eligibility.reason ||
            'You can leave a review after your first completed paid lesson.'}
        </p>
      </section>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await client.post('/testimonials/submit', {
        student_name: name.trim(),
        location: location.trim() || null,
        body: body.trim(),
        rating,
      });
      setSuccess(true);
      onSubmitted?.(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel panel-pad" style={{ marginTop: 40 }}>
      {intro}
      <p style={{ margin: '0 0 20px', color: 'var(--fg-muted)', fontSize: 15 }}>
        Your review goes to the tutor first — they'll publish it after a quick check.
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="vrev-name">Display name</label>
          <input
            id="vrev-name"
            className="v-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sara M."
            required
            maxLength={120}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="vrev-location">Where you're learning from <span style={{ color: 'var(--fg-subtle)', fontWeight: 500 }}>(optional)</span></label>
          <input
            id="vrev-location"
            className="v-input"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Sydney, Australia"
            maxLength={120}
          />
        </div>
        <div className="field">
          <label className="field-label">Stars</label>
          <div className="star-picker">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                className={n <= rating ? 'on' : ''}
                onClick={() => setRating(n)}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
              >
                {n <= rating ? <FaStar size={22} /> : <FaRegStar size={22} />}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="vrev-body">What worked, what surprised you</label>
          <textarea
            id="vrev-body"
            className="v-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="A sentence or two is plenty — keep it real."
            required
            minLength={12}
            maxLength={2000}
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button
          type="submit"
          className="v-btn v-btn-primary"
          disabled={submitting || !body.trim() || !name.trim()}
        >
          {submitting ? 'Sending…' : 'Submit review'}
        </button>
      </form>
    </section>
  );
};

export default VassoReviews;
