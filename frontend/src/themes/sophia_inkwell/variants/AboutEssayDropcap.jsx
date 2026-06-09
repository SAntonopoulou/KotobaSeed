import React, { useState } from 'react';

// About — long-form essay with a large coral Playfair drop cap.
// Square portrait above the essay, centered.

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'About' },
  title: { type: 'text', max: 100 },
  essay: {
    type: 'long-text',
    max: 2400,
    required: true,
    hint: 'First letter renders as a coral italic drop cap. Plain paragraphs separated by blank lines.',
  },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const AboutEssayDropcap = ({ content = {}, tutor, firstName }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const essay = getValue(content, 'essay') || tutor?.bio;
  if (!essay) return null;

  const paragraphs = essay.split(/\n+/).filter((p) => p.trim());
  const fn = firstName || tutor?.display_name || 'Sophia';

  return (
    <section id="about" className="s-section">
      <div className="s-wrap">
        <div className="s-about">
          {tutor?.photo_url && !imgFailed ? (
            <div className="s-about-photo">
              <img
                src={tutor.photo_url}
                alt={fn}
                onError={() => setImgFailed(true)}
              />
            </div>
          ) : (
            <div className="s-about-photo" aria-hidden="true">
              <div
                style={{
                  width: '100%', height: '100%',
                  display: 'grid', placeItems: 'center',
                  background: 'linear-gradient(135deg, var(--navy-200), var(--coral-200))',
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontWeight: 700,
                  fontSize: 80,
                  color: 'var(--brand)',
                }}
              >
                {fn.charAt(0)}
              </div>
            </div>
          )}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <span className="s-eyebrow">{getValue(content, 'eyebrow')}</span>
            {getValue(content, 'title') && (
              <h2 style={{ fontSize: 'clamp(1.8rem, 1.2rem + 1.6vw, 2.6rem)', margin: '12px 0 0' }}>
                {getValue(content, 'title')}
              </h2>
            )}
          </div>
          <div className="s-about-essay">
            {paragraphs.map((p, i) => (
              <p key={i} style={i === 0 ? {} : { marginTop: 18 }}>{p}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutEssayDropcap;
