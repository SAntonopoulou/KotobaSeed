import React from 'react';

// Features — leaf-stem dividers.
//
// Dafni-only. Vertical column of numbered steps with a hand-drawn
// sage leaf-stem SVG between each. Calm + handmade feel. No icons,
// no shadow cards, no horizontal grid.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'How it works' },
  title: { type: 'text', max: 100, required: true },
  sub: { type: 'long-text', max: 300 },
  steps: {
    type: 'list',
    required: true,
    item: {
      n: { type: 'text', max: 6 },
      title: { type: 'text', max: 80, required: true },
      desc: { type: 'long-text', max: 280 },
    },
  },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const LeafStem = () => (
  <svg
    className="d-feat-divider"
    width="40"
    height="48"
    viewBox="0 0 40 48"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M20 4 C20 16 20 32 20 44"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path
      d="M20 20 C16 18 12 16 10 13 C13 12 17 13 20 16"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M20 28 C24 26 28 24 30 21 C27 20 23 21 20 24"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const FeaturesLeafDividers = ({ content = {} }) => {
  const steps = getValue(content, 'steps') || [];
  const title = getValue(content, 'title');
  if (!title || steps.length === 0) return null;

  return (
    <section id="how" className="d-section-sand">
      <div className="d-wrap">
        <div style={{ textAlign: 'center', marginBottom: 48, maxWidth: 600, margin: '0 auto 48px' }}>
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
        <div className="d-features-stack">
          {steps.map((s, i) => (
            <React.Fragment key={s.title || i}>
              <div className="d-feat-step">
                <div className="d-feat-step-n">{s.n || `${i + 1}.`}</div>
                <div>
                  <h3>{s.title}</h3>
                  {s.desc && <p>{s.desc}</p>}
                </div>
              </div>
              {i < steps.length - 1 && <LeafStem />}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesLeafDividers;
