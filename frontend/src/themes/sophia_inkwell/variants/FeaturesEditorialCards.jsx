import React from 'react';

// Features — editorial three-up cards. Italic Playfair numerals,
// clean cream cards, brief copy.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'How lessons work' },
  title: { type: 'text', max: 100, required: true },
  sub: { type: 'long-text', max: 300 },
  steps: {
    type: 'list',
    required: true,
    item: {
      n: { type: 'text', max: 4 },
      title: { type: 'text', max: 50, required: true },
      desc: { type: 'long-text', max: 220 },
    },
  },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const FeaturesEditorialCards = ({ content = {} }) => {
  const steps = getValue(content, 'steps') || [];
  const title = getValue(content, 'title');
  if (!title || steps.length === 0) return null;

  return (
    <section id="features" className="s-section">
      <div className="s-wrap">
        <div style={{ textAlign: 'center', marginBottom: 56, maxWidth: 620, margin: '0 auto 56px' }}>
          <span className="s-eyebrow">{getValue(content, 'eyebrow')}</span>
          <h2 style={{ fontSize: 'clamp(1.8rem, 1.2rem + 1.6vw, 2.6rem)', margin: '12px 0 0' }}>
            {title}
          </h2>
          {getValue(content, 'sub') && (
            <p style={{ marginTop: 16, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              {getValue(content, 'sub')}
            </p>
          )}
        </div>
        <div className="s-features">
          {steps.map((step, i) => (
            <article className="s-feat" key={step.title || i}>
              <div className="s-feat-n">{step.n || `${i + 1}.`}</div>
              <h3>{step.title}</h3>
              {step.desc && <p>{step.desc}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesEditorialCards;
