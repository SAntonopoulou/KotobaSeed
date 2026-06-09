import React from 'react';

// Reviews — quiet quotes.
//
// Dafni-only. Single column of large italic Fraunces quotes with a
// soft sage opening quote-mark behind each. No avatar circles, no
// star icons — the typography itself carries the warmth.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'Loved by learners' },
  title: { type: 'text', max: 100, required: true },
  sub: { type: 'long-text', max: 300 },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const ReviewsQuietQuotes = ({ content = {}, testimonials = [] }) => {
  const list = (testimonials || []).slice(0, 5);
  if (list.length === 0) return null;
  const title = getValue(content, 'title');
  if (!title) return null;

  return (
    <section id="reviews" className="d-section">
      <div className="d-wrap">
        <div style={{ textAlign: 'center', marginBottom: 64, maxWidth: 600, margin: '0 auto 64px' }}>
          <span className="d-eyebrow">{getValue(content, 'eyebrow')}</span>
          <h2 style={{ fontSize: 'clamp(1.8rem, 1.2rem + 1.6vw, 2.6rem)', margin: '12px 0 0' }}>
            {title}
          </h2>
          {getValue(content, 'sub') && (
            <p style={{ marginTop: 16, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              {getValue(content, 'sub')}
            </p>
          )}
        </div>
        <div className="d-reviews-list">
          {list.map((t, i) => (
            <figure className="d-review" key={t.id || i}>
              <blockquote>{t.body || t.quote_text || t.quote}</blockquote>
              <figcaption className="d-review-by">
                <b>{t.student_name || t.name || 'A student'}</b>
                {t.location && <span>· {t.location}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ReviewsQuietQuotes;
