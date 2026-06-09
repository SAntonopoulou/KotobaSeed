import React from 'react';
import { Link } from 'react-router-dom';
import { FaStar } from 'react-icons/fa6';

// Grid of testimonial cards on the landing — capped at 6, with a
// "See all reviews" link when there are more. The full grid lives on
// /reviews (rendered by VassoReviews).

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'Loved by learners' },
  title_pre: { type: 'text', max: 60, default: 'From first ' },
  title_gr: { type: 'text', max: 20, default: 'γεια σου' },
  title_post: { type: 'text', max: 60, default: ' to real conversations' },
  sub: {
    type: 'long-text',
    max: 200,
    default: 'A few words from students around the world.',
  },
  see_all_label: { type: 'text', max: 30, default: 'See all reviews' },
  avatar_palette: {
    type: 'colors',
    default: ['#7fb5e6', '#e8b84b', '#7e944f', '#dc6a3f', '#0f5fa6', '#c99a2e'],
  },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const ReviewsAvatarCards = ({ content = {}, testimonials = [] }) => {
  if (!testimonials || testimonials.length === 0) return null;
  const colors = getValue(content, 'avatar_palette');

  return (
    <section id="reviews" className="v-section reviews">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">{getValue(content, 'eyebrow')}</span>
          <h2>
            {getValue(content, 'title_pre')}
            <span className="gr">{getValue(content, 'title_gr')}</span>
            {getValue(content, 'title_post')}
          </h2>
          <p>{getValue(content, 'sub')}</p>
        </div>
        <div className="rev-grid">
          {testimonials.slice(0, 6).map((t, i) => (
            <figure className="reviewcard" key={t.id || i}>
              <div className="stars">
                {Array.from({ length: Math.max(1, Math.min(5, t.rating || 5)) }).map((_, k) => (
                  <FaStar key={k} size={16} />
                ))}
              </div>
              <blockquote>{t.body || t.quote_text || t.quote}</blockquote>
              <figcaption>
                <span
                  className="av"
                  style={{ background: colors[i % colors.length] }}
                >
                  {(t.student_name || t.name || 'A').charAt(0)}
                </span>
                <span className="meta">
                  <b>{t.student_name || t.name || 'A student'}</b>
                  {t.location && <small>{t.location}</small>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        {testimonials.length > 6 && (
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <Link to="/reviews" className="v-btn v-btn-secondary">
              {getValue(content, 'see_all_label')}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default ReviewsAvatarCards;
