import React, { useState } from 'react';

// Portrait-in-gold-ring + first-person <q> blockquote + "Book your
// first lesson" CTA. Uses the tutor's bio as the quote when content
// doesn't override it.

export const contentSchema = {
  eyebrow: { type: 'text', max: 40, default: 'Meet your teacher' },
  // Bio comes from tutor.bio at render time; if the tutor blanks their
  // bio AND no quote_fallback_template is set in the theme, the about
  // section won't render. No baked-in fake quote on the public site.
  quote_fallback_template: { type: 'long-text', max: 600 },
  signoff_template: { type: 'text', max: 80, default: '— {firstName}, your teacher' },
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

const AboutTestimonialQuote = ({ content = {}, tutor, firstName, trial, onBook }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const portraitUrl = tutor?.photo_url || '/vasso-portrait.png';
  const fn = firstName || tutor?.display_name || 'Tutor';

  const fallbackTemplate = getValue(content, 'quote_fallback_template');
  const fallback = fallbackTemplate
    ? interpolate(fallbackTemplate, { firstName: fn })
    : null;
  const quote = tutor?.bio?.trim() || fallback;
  // No bio AND no fallback → hide the entire About section.
  if (!quote) return null;
  const signoff = interpolate(getValue(content, 'signoff_template'), { firstName: fn });

  const onCta = (e) => {
    if (trial?.pack && onBook) {
      e.preventDefault();
      onBook({ ...trial.pack, isTrial: true });
    }
  };

  return (
    <section id="about" className="v-section testi">
      <div className="wrap">
        <div className="box">
          <div className="pic">
            {imgFailed ? (
              <div className="pic-fallback">{fn.charAt(0)}</div>
            ) : (
              <img
                src={portraitUrl}
                alt={fn}
                onError={() => setImgFailed(true)}
              />
            )}
          </div>
          <blockquote>
            <span
              className="eyebrow"
              style={{ marginBottom: 12, display: 'inline-flex' }}
            >
              {getValue(content, 'eyebrow')}
            </span>
            <q>{quote}</q>
            <div
              className="who"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 14,
                marginTop: 18,
              }}
            >
              <span>{signoff.split(/<b>(.*?)<\/b>/).map((seg, i) => i % 2 ? <b key={i}>{seg}</b> : seg)}</span>
              <a href="#pricing" onClick={onCta} className="v-btn v-btn-primary">
                {getValue(content, 'cta_label')}
              </a>
            </div>
          </blockquote>
        </div>
      </div>
    </section>
  );
};

export default AboutTestimonialQuote;
