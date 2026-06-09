import React, { useState } from 'react';

// About — long-form essay layout with drop cap.
//
// Dafni-only. Square portrait centered above an essay-style bio with
// a serif drop cap. The signoff is italic, right-aligned, like a
// letter sign-off. A single calm CTA at the bottom centred.
//
// Bio comes from tutor.bio at render time; theme can override via
// `essay_fallback_template`. If neither is present, the about
// section hides entirely.

export const contentSchema = {
  eyebrow: { type: 'text', max: 40, default: 'About me' },
  essay_fallback_template: {
    type: 'long-text',
    max: 1200,
    hint: 'Used only when the tutor leaves their profile bio blank. {firstName} interpolates.',
  },
  signoff_template: { type: 'text', max: 100, default: '— {firstName}' },
  cta_label: { type: 'text', max: 40, default: 'Book your first lesson' },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const interpolate = (str, vars) => {
  if (typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
};

const AboutLongFormDropcap = ({ content = {}, tutor, firstName, trial, onBook }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUrl = tutor?.photo_url || '/dafni-portrait.jpg';
  const fn = firstName || tutor?.display_name || 'Dafni';

  const fallbackTemplate = getValue(content, 'essay_fallback_template');
  const fallback = fallbackTemplate
    ? interpolate(fallbackTemplate, { firstName: fn })
    : null;
  const essay = tutor?.bio?.trim() || fallback;
  if (!essay) return null;

  const signoff = interpolate(getValue(content, 'signoff_template'), { firstName: fn });

  const onCta = (e) => {
    if (trial?.pack && onBook) {
      e.preventDefault();
      onBook({ ...trial.pack, isTrial: true });
    }
  };

  return (
    <section id="about" className="d-section">
      <div className="d-about">
        <span className="d-eyebrow">{getValue(content, 'eyebrow')}</span>
        <div className="d-about-photo" style={{ marginTop: 24 }}>
          {imgFailed ? (
            <div className="d-hero-photo-fallback" style={{ fontSize: 72 }}>
              {fn.charAt(0)}
            </div>
          ) : (
            <img
              src={photoUrl}
              alt={fn}
              onError={() => setImgFailed(true)}
            />
          )}
        </div>
        <div className="d-about-essay">
          {essay.split(/\n+/).map((para, i) => (
            <p key={i} style={{ margin: i === 0 ? '0 0 1.2em' : '0 0 1em' }}>
              {para}
            </p>
          ))}
        </div>
        <p className="d-about-signoff">{signoff}</p>
        <div className="d-about-cta">
          <a href="#pricing" onClick={onCta} className="d-btn d-btn-primary d-btn-lg">
            {getValue(content, 'cta_label')}
          </a>
        </div>
      </div>
    </section>
  );
};

export default AboutLongFormDropcap;
