import React from 'react';

// Reviews — single column of large italic Playfair quotes with a coral
// left rule + giant coral opening quote mark behind each.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'What students say' },
  title: { type: 'text', max: 100 },
  sub: { type: 'long-text', max: 300 },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const ReviewsInkwellQuotes = ({ content = {}, testimonials = [] }) => {
  const active = (testimonials || []).filter(
    (t) => t && (t.body || t.body_text) && (t.is_active === undefined ? true : t.is_active),
  );
  if (active.length === 0) return null;

  return (
    <section id="reviews" className="s-section">
      <div className="s-wrap">
        <div style={{ textAlign: 'center', marginBottom: 56, maxWidth: 620, margin: '0 auto 56px' }}>
          <span className="s-eyebrow">{getValue(content, 'eyebrow')}</span>
          {getValue(content, 'title') && (
            <h2 style={{ fontSize: 'clamp(1.8rem, 1.2rem + 1.6vw, 2.6rem)', margin: '12px 0 0' }}>
              {getValue(content, 'title')}
            </h2>
          )}
          {getValue(content, 'sub') && (
            <p style={{ marginTop: 16, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              {getValue(content, 'sub')}
            </p>
          )}
        </div>
        <div className="s-reviews">
          {active.slice(0, 6).map((t, i) => (
            <article className="s-review" key={t.id || i}>
              <blockquote>{t.body || t.body_text}</blockquote>
              <div className="s-review-by">
                <b>{t.author_name || 'Student'}</b>
                {t.author_role && ` · ${t.author_role}`}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ReviewsInkwellQuotes;
