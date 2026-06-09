import React from 'react';
import { Link } from 'react-router-dom';
import { FaStar } from 'react-icons/fa6';
import { WashiTape, HandDrawnUnderline } from '../Motifs';

// Reviews — Scrapbook (v2).
// Mary-only. Dotted cream background with multicolour washi-tape headers
// in honey / blush / sage / lavender rotation. Cards have dramatic
// tilts and softer paper edges. Hides cleanly when there's no
// testimonial content yet.

export const contentSchema = {
  eyebrow: { type: 'text', max: 80 },
  title_pre: { type: 'text', max: 120 },
  title_serif: { type: 'text', max: 120, hint: 'Italic blush phrase rendered as <em>.' },
  sub: { type: 'long-text', max: 400 },
  see_all_label: { type: 'text', max: 40, default: 'See all reviews' },
};

const get = (content, key) =>
  (content && content[key] != null ? content[key] : contentSchema[key]?.default);

const TAPE_COLORS = ['honey', 'blush', 'sage', 'lavender', 'honey', 'blush'];

const ReviewsScrapbook = ({ content = {}, testimonials = [] }) => {
  // Strict hide-when-empty — the section disappears entirely if Mary
  // hasn't gathered any testimonials yet.
  if (!Array.isArray(testimonials) || testimonials.length === 0) return null;

  const eyebrow = get(content, 'eyebrow');
  const titlePre = get(content, 'title_pre');
  const titleSerif = get(content, 'title_serif');
  const sub = get(content, 'sub');
  const seeAll = get(content, 'see_all_label');

  return (
    <section className="m-section m-reviews" id="reviews">
      <div className="m-wrap">
        <div className="m-rev-head">
          {eyebrow && (
            <span className="m-eyebrow">
              {eyebrow}
              <HandDrawnUnderline className="m-underline" width={120} />
            </span>
          )}
          <h2 className="m-title">
            {titlePre}
            {titlePre && titleSerif && ' '}
            {titleSerif && <em>{titleSerif}</em>}
          </h2>
          {sub && <p className="m-sub m-sub-center">{sub}</p>}
        </div>
        <div className="m-rev-grid">
          {testimonials.slice(0, 6).map((t, idx) => {
            const name = t.author_name || t.student_name || 'A student';
            const rating = Number(t.rating) || 5;
            const meta = t.subtitle || t.author_role || '';
            const initial = (name || '?').charAt(0).toUpperCase();
            const tapeColor = TAPE_COLORS[idx % TAPE_COLORS.length];
            return (
              <article key={t.id || idx} className="m-rev">
                <WashiTape color={tapeColor} width={92} className="m-rev-tape" />
                <div className="m-rev-stars" aria-label={`${rating} out of 5 stars`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <FaStar
                      key={i}
                      size={14}
                      style={{ opacity: i < rating ? 1 : 0.18 }}
                    />
                  ))}
                </div>
                <p className="m-rev-quote">“{t.quote || t.body || t.text}”</p>
                <div className="m-rev-author">
                  <span className="m-rev-avatar">{initial}</span>
                  <div>
                    <div className="m-rev-name">{name}</div>
                    {meta && <div className="m-rev-meta">{meta}</div>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {seeAll && testimonials.length > 6 && (
          <div className="m-rev-see-all">
            <Link to="/reviews">{seeAll} →</Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default ReviewsScrapbook;
