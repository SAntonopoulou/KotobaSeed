import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaStar, FaRegStar } from 'react-icons/fa6';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import DafniLayout from './DafniLayout';
import './dafni_botanical.css';

// DafniReviews — themed `/reviews` page. Backend integration is
// identical to VassoReviews:
//   GET /testimonials              — public published list
//   GET /testimonials/eligibility  — gates the submission form
//   POST /testimonials/submit      — student submits a draft review
//
// Server-enforced eligibility (mirrored client-side for UX only):
//   1. Authenticated viewer (not the tutor)
//   2. At least one COMPLETED non-trial booking with this tutor
//   3. Has not already submitted a review for this tutor
//
// Visual treatment differs: editorial single column of large italic
// Fraunces quotes (mirrors ReviewsQuietQuotes), terracotta-200 left
// rule, sage author names, no avatar cards. The submit form is a
// calm cream panel with a terracotta star row and Fraunces italic
// helper text.

const DafniReviews = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Dafni';

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
    <DafniLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Reviews — Learn Greek with ${firstName}`}
    >
      <main className="d-content">
        <span className="d-eyebrow">Loved by learners</span>
        <h1 className="d-pt">Words from students</h1>
        <p className="d-pt-sub">
          A few notes from people learning Greek with {firstName}.
        </p>

        {error && <p className="d-form-error">{error}</p>}
        {reviews === null && <div className="d-empty">Loading…</div>}
        {reviews && reviews.length === 0 && !error && (
          <div className="d-empty">No published reviews yet — be the first.</div>
        )}

        {reviews && reviews.length > 0 && (
          <div className="d-reviews-page-list">
            {reviews.map((t, i) => (
              <figure className="d-review-quiet" key={t.id || i}>
                <blockquote className="d-review-quiet-body">{t.body}</blockquote>
                <figcaption className="d-review-quiet-by">
                  <b>{t.student_name || 'A student'}</b>
                  {t.location && <span> · {t.location}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <ReviewSubmissionPanel
          tutor={tutor}
          currentUser={currentUser}
          eligibility={eligibility}
          firstName={firstName}
          onSubmitted={(row) => {
            setEligibility((prev) => ({
              ...(prev || { eligible: true }),
              already_submitted: true,
              reason:
                prev?.reason ||
                'Your review is on the way — the tutor will publish it shortly.',
            }));
            void row;
          }}
        />
      </main>
    </DafniLayout>
  );
};

const ReviewSubmissionPanel = ({
  tutor,
  currentUser,
  eligibility,
  firstName,
  onSubmitted,
}) => {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [name, setName] = useState(currentUser?.full_name || '');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (eligibility === null) return null;

  const intro = (
    <span className="d-eyebrow d-review-submit-eyebrow">Leave a review</span>
  );

  if (!currentUser) {
    return (
      <section className="d-panel d-review-submit">
        {intro}
        <p className="d-review-submit-helper">
          Sign in to share how your lessons with {firstName} have gone.
        </p>
        <Link
          to={`/login?next=${encodeURIComponent('/reviews')}`}
          className="d-btn d-btn-primary"
        >
          Sign in
        </Link>
      </section>
    );
  }

  if (success || eligibility.already_submitted) {
    return (
      <section className="d-panel d-review-submit">
        {intro}
        <p className="d-form-success" style={{ margin: 0 }}>
          {success
            ? 'Thanks for leaving a review — it goes live once the tutor approves it.'
            : eligibility.reason || 'Your review is on the way.'}
        </p>
      </section>
    );
  }

  if (!eligibility.eligible) {
    return (
      <section className="d-panel d-review-submit">
        {intro}
        <p className="d-review-submit-helper">
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
    <section className="d-panel d-review-submit">
      {intro}
      <p className="d-review-submit-helper">
        Your review goes to {firstName} first — she publishes it after a quick read.
      </p>
      <form onSubmit={submit}>
        <div className="d-field">
          <label className="d-field-label" htmlFor="drev-name">Display name</label>
          <input
            id="drev-name"
            className="d-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sara M."
            required
            maxLength={120}
          />
        </div>
        <div className="d-field">
          <label className="d-field-label" htmlFor="drev-location">
            Where you're learning from{' '}
            <span style={{ color: 'var(--fg-subtle)', fontWeight: 500 }}>
              (optional)
            </span>
          </label>
          <input
            id="drev-location"
            className="d-input"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Sydney, Australia"
            maxLength={120}
          />
        </div>
        <div className="d-field">
          <label className="d-field-label">Stars</label>
          <div className="d-star-picker">
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
        <div className="d-field">
          <label className="d-field-label" htmlFor="drev-body">
            What worked, what surprised you
          </label>
          <textarea
            id="drev-body"
            className="d-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="A sentence or two is plenty — keep it real."
            required
            minLength={12}
            maxLength={2000}
          />
        </div>
        {error && <p className="d-form-error">{error}</p>}
        <button
          type="submit"
          className="d-btn d-btn-primary"
          disabled={submitting || !body.trim() || !name.trim()}
        >
          {submitting ? 'Sending…' : 'Submit review'}
        </button>
      </form>
    </section>
  );
};

export default DafniReviews;
