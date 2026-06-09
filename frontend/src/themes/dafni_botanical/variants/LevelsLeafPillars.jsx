import React from 'react';

// Levels — leaf pillar cards.
//
// Dafni-only. Vertical stack of cards. Each card has a large sage
// leaf SVG on the left and the level name, description, bullets on
// the right. No CEFR glyph badge — the leaf carries the visual
// weight instead.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'Find your level' },
  title: { type: 'text', max: 100, required: true },
  sub: { type: 'long-text', max: 300 },
  levels: {
    type: 'list',
    required: true,
    item: {
      name: { type: 'text', max: 30, required: true },
      desc: { type: 'long-text', max: 200 },
      items: { type: 'list', item: { type: 'text', max: 80 } },
    },
  },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const LEAVES = [
  // Small leaf — beginner
  <svg key="a" viewBox="0 0 100 110" fill="none" aria-hidden="true">
    <path
      d="M50 100 C50 80 50 50 50 18 C36 20 22 32 22 52 C22 70 34 88 50 100 Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M50 100 L50 30" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>,
  // Medium two-lobe — intermediate
  <svg key="b" viewBox="0 0 100 110" fill="none" aria-hidden="true">
    <path
      d="M50 100 C50 82 50 56 50 22 C36 24 24 36 22 56 C22 72 34 88 50 100 Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M50 100 C50 82 50 56 50 22 C64 24 76 36 78 56 C78 72 66 88 50 100 Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M50 100 L50 30" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>,
  // Branched — advanced
  <svg key="c" viewBox="0 0 100 110" fill="none" aria-hidden="true">
    <path d="M50 105 L50 18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path
      d="M50 50 C44 44 36 38 28 36 C30 44 38 50 48 52"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M50 50 C56 44 64 38 72 36 C70 44 62 50 52 52"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M50 72 C44 66 36 60 28 58 C30 66 38 72 48 74"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M50 72 C56 66 64 60 72 58 C70 66 62 72 52 74"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>,
];

const LevelsLeafPillars = ({ content = {} }) => {
  const levels = getValue(content, 'levels') || [];
  const title = getValue(content, 'title');
  if (!title || levels.length === 0) return null;

  return (
    <section id="levels" className="d-section">
      <div className="d-wrap">
        <div style={{ textAlign: 'center', marginBottom: 56, maxWidth: 600, margin: '0 auto 56px' }}>
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
        <div className="d-levels-stack">
          {levels.map((l, i) => (
            <article className="d-level" key={l.name || i}>
              <div className="d-level-leaf">{LEAVES[i % LEAVES.length]}</div>
              <div>
                <h3>{l.name}</h3>
                {l.desc && <p className="d-level-desc">{l.desc}</p>}
                {Array.isArray(l.items) && l.items.length > 0 && (
                  <ul>
                    {l.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LevelsLeafPillars;
