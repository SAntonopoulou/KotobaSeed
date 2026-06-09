import React from 'react';
import { FaCheck } from 'react-icons/fa6';

// Three CEFR-style level cards on a deep aegean background. Each card
// has a Greek glyph + level name + brief desc + bullet list. The block
// background is the brand "deep sea" colour set in the parent theme's
// `.levels` rule.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'Find your level' },
  title: { type: 'text', max: 80, required: true },
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

const LevelsGlyphAegean = ({ content = {} }) => {
  const levels = getValue(content, 'levels') || [];
  const title = getValue(content, 'title');
  // Required content gate — if the tutor hasn't filled in the levels
  // list and a title, the section just doesn't render. Same pattern as
  // Pricing + Reviews: no fake placeholder content on the live site.
  if (!title || levels.length === 0) return null;
  return (
    <section id="levels" className="v-section levels">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">{getValue(content, 'eyebrow')}</span>
          <h2>{title}</h2>
          {getValue(content, 'sub') && <p>{getValue(content, 'sub')}</p>}
        </div>
        <div className="lv-grid">
          {levels.map((l) => (
            <div className="lv" key={l.g}>
              <div className="glyph">{l.g}</div>
              <h3>{l.name}</h3>
              <p>{l.desc}</p>
              <ul>
                {(l.items || []).map((it) => (
                  <li key={it}>
                    <FaCheck size={17} /> {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LevelsGlyphAegean;
