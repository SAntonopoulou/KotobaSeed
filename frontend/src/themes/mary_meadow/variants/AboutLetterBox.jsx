import React, { useState } from 'react';
import { SleepingCat, HandDrawnUnderline } from '../Motifs';

// About — Letter Box (v2).
// Mary-only. Lavender-wash section with a centred "letter" card. The
// card has a tilted dashed postmark in the upper-right, a circular
// portrait at the top, a serif title with optional italic-brand
// emphasis, the bio rendered with a hand-drawn drop cap, and a
// handwritten Caveat signoff that tilts. A sleeping-cat decoration is
// tucked into the section's lower-right outside the card.

export const contentSchema = {
  eyebrow: { type: 'text', max: 80 },
  headline_pre: { type: 'text', max: 120 },
  headline_serif: { type: 'text', max: 120, hint: 'Italic blush phrase rendered as <em>.' },
  body: { type: 'long-text', max: 4000, hint: "Leave blank to use the tutor's User.bio." },
  signoff_template: { type: 'text', max: 80, default: 'With warm regards,<br/><b>{firstName}</b>' },
  cta_label: { type: 'text', max: 40, default: 'Book a first lesson' },
};

const get = (content, key) =>
  (content && content[key] != null ? content[key] : contentSchema[key]?.default);

const renderTemplate = (str, vars) => {
  if (typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
};

const AboutLetterBox = ({ content = {}, tutor, firstName }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fn = firstName || tutor?.display_name || 'Mary';
  const photoUrl = tutor?.photo_url || null;

  const eyebrow = get(content, 'eyebrow');
  const headlinePre = get(content, 'headline_pre');
  const headlineSerif = get(content, 'headline_serif');
  const body = (get(content, 'body') || tutor?.bio || '').trim();
  const signoff = renderTemplate(get(content, 'signoff_template'), { firstName: fn });
  const ctaLabel = get(content, 'cta_label');

  if (!body && !headlinePre && !headlineSerif) return null;

  return (
    <section className="m-section m-about" id="about">
      <SleepingCat className="m-about-cat" size={220} />
      <div className="m-wrap">
        <div className="m-about-wrap">
          {eyebrow && (
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <span className="m-eyebrow">
                {eyebrow}
                <HandDrawnUnderline className="m-underline" width={120} />
              </span>
            </div>
          )}
          <div className="m-about-portrait">
            {imgFailed || !photoUrl ? (
              <div className="m-about-portrait-fb">{fn.charAt(0)}</div>
            ) : (
              <img
                src={photoUrl}
                alt={`${fn}, your teacher`}
                onError={() => setImgFailed(true)}
              />
            )}
          </div>
          {(headlinePre || headlineSerif) && (
            <h2 className="m-about-title">
              {headlinePre}
              {headlinePre && headlineSerif && ' '}
              {headlineSerif && <em>{headlineSerif}</em>}
            </h2>
          )}
          {body && <div className="m-about-body">{body}</div>}
          {signoff && (
            <div
              className="m-about-signoff"
              dangerouslySetInnerHTML={{ __html: signoff }}
            />
          )}
          {ctaLabel && (
            <div className="m-about-cta">
              <a href="#pricing" className="m-btn m-btn-primary m-btn-lg">
                {ctaLabel}
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default AboutLetterBox;
