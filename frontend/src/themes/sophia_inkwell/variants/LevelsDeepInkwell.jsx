import React from 'react';

// Levels — three glass-effect cards on a deep navy band. The page's
// dramatic mid-section. CEFR-style level glyphs in italic coral
// Playfair render the "Inkwell" identity.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'Find your level' },
  title: { type: 'text', max: 100, required: true },
  sub: { type: 'long-text', max: 300 },
  levels: {
    type: 'list',
    required: true,
    item: {
      g: { type: 'text', max: 4 },
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

const LevelsDeepInkwell = ({ content = {} }) => {
  const levels = getValue(content, 'levels') || [];
  const title = getValue(content, 'title');
  if (!title || levels.length === 0) return null;

  return (
    <section id="levels" className="s-section">
      <div className="s-wrap">
        <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
          <span className="s-eyebrow">{getValue(content, 'eyebrow')}</span>
          <h2 style={{ fontSize: 'clamp(1.8rem, 1.2rem + 1.6vw, 2.6rem)', margin: '12px 0 0' }}>
            {title}
          </h2>
          {getValue(content, 'sub') && (
            <p style={{ marginTop: 16, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--bone-200)', lineHeight: 1.6 }}>
              {getValue(content, 'sub')}
            </p>
          )}
        </div>
        <div className="s-levels">
          {levels.map((l, i) => (
            <article className="s-level" key={l.name || i}>
              {l.g && <div className="s-level-glyph">{l.g}</div>}
              <h3>{l.name}</h3>
              {l.desc && <p className="s-level-desc">{l.desc}</p>}
              {Array.isArray(l.items) && l.items.length > 0 && (
                <ul>
                  {l.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LevelsDeepInkwell;
