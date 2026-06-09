import React from 'react';
import { TulipSprig, HandDrawnUnderline } from '../Motifs';

// Levels — Garden Beds (v2).
// Mary-only. Three soft cards on a full-bleed sage wash background.
// Each card has a blush+honey glyph circle (α/β/γ) and a small tulip
// sprig in the upper-right; a multicoloured "soil row" runs along the
// bottom of every card (sage stripes + ladybird/sun dots).

export const contentSchema = {
  eyebrow: { type: 'text', max: 80 },
  title_pre: { type: 'text', max: 120 },
  title_serif: { type: 'text', max: 120, hint: 'Italic blush phrase rendered as <em>.' },
  sub: { type: 'long-text', max: 400 },
  levels: {
    type: 'list',
    of: {
      g: { type: 'text', max: 4 },
      name: { type: 'text', max: 60 },
      desc: { type: 'long-text', max: 400 },
      items: { type: 'list', of: { type: 'text', max: 120 } },
    },
    min: 3,
    max: 3,
  },
};

const Sprout = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
    <path d="M8 14V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path
      d="M8 10C5 8 3 7 2 8C3 10 5 11 8 11"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 8C11 6 13 5 14 6C13 8 11 9 8 9"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" fill="none" />
  </svg>
);

const LevelsGardenBeds = ({ content = {} }) => {
  const eyebrow = content.eyebrow;
  const titlePre = content.title_pre;
  const titleSerif = content.title_serif;
  const sub = content.sub;
  const levels = Array.isArray(content.levels) ? content.levels : [];

  if (levels.length === 0) return null;

  return (
    <section className="m-section m-levels" id="levels">
      <div className="m-wrap">
        <div className="m-levels-head">
          {eyebrow && (
            <span className="m-eyebrow">
              {eyebrow}
              <HandDrawnUnderline className="m-underline" width={140} />
            </span>
          )}
          <h2 className="m-title">
            {titlePre}
            {titlePre && titleSerif && ' '}
            {titleSerif && <em>{titleSerif}</em>}
          </h2>
          {sub && <p className="m-sub m-sub-center">{sub}</p>}
        </div>
        <div className="m-levels-grid">
          {levels.map((level, idx) => (
            <article key={idx} className="m-level">
              <TulipSprig className="m-level-tulip" size={32} />
              <div className="m-level-glyph">{level.g}</div>
              {level.name && (
                <span className="m-level-name">{level.name.toLowerCase()}</span>
              )}
              <h3>{level.name}</h3>
              {level.desc && <p>{level.desc}</p>}
              {Array.isArray(level.items) && level.items.length > 0 && (
                <ul>
                  {level.items.map((it, j) => (
                    <li key={j}>
                      <Sprout />
                      <span>{it}</span>
                    </li>
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

export default LevelsGardenBeds;
