import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// Hero — Inkwell literary.
//
// Sophia-only. Editorial English-tutor layout:
//   - Large Playfair Display headline (deep navy) with inline italic
//     coral phrase support
//   - Hand-drawn calligraphic ink-stroke flourish SVG sweeping behind
//     the portrait (signature visual move)
//   - Two floating pills: navy "level" badge bottom-left + coral pulse
//     "now booking" indicator top-right
//   - Three CTAs (send first message + book a lesson + trial)

export const contentSchema = {
  eyebrow: { type: 'text', max: 80 },
  headline_tagline: {
    type: 'text',
    max: 80,
    hint: 'Optional italic-coral phrase rendered before the rest of the headline.',
  },
  headline: {
    type: 'long-text',
    max: 200,
    required: true,
    hint: 'Wrap a phrase in <em>...</em> to make it italic coral inline.',
  },
  sub: { type: 'long-text', max: 400 },
  primary_cta_label: { type: 'text', max: 40, default: 'Send first message' },
  primary_cta_href: { type: 'text', max: 200, default: '/contact' },
  secondary_cta_label: { type: 'text', max: 40, default: 'Book a lesson' },
  secondary_cta_href: { type: 'text', max: 200, default: '#pricing' },
  tertiary_cta_label: { type: 'text', max: 40, default: 'Trial lesson' },
  float_level_letter: { type: 'text', max: 4 },
  float_level_title: { type: 'text', max: 30 },
  float_level_sub: { type: 'text', max: 60 },
  float_booking_title: { type: 'text', max: 30 },
  float_booking_sub: { type: 'text', max: 60 },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

function renderHeadline(raw) {
  if (typeof raw !== 'string') return raw;
  const parts = raw.split(/<em>(.*?)<\/em>/g);
  return parts.map((seg, i) => (i % 2 ? <em key={i}>{seg}</em> : seg));
}

// Calligraphic ink flourish — large curling SVG stroke. Signature
// visual motif for the Inkwell direction.
const InkFlourish = () => (
  <svg
    className="s-hero-flourish"
    viewBox="0 0 420 520"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M40 80 C80 40 160 30 220 70 C290 110 340 180 320 260 C300 340 220 380 150 360 C90 340 60 280 90 230 C120 180 200 170 250 200 C290 230 290 290 250 320 C220 340 180 340 160 320"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <path
      d="M260 360 C300 380 360 400 400 420"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.7"
    />
    <circle cx="60" cy="92" r="5" fill="currentColor" opacity="0.7" />
    <circle cx="395" cy="425" r="5" fill="currentColor" opacity="0.7" />
  </svg>
);

const HeroInkwellLiterary = ({ content = {}, tutor, firstName, trial, onBook, isAcceptingBookings = true }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUrl = tutor?.photo_url || '/sophia-portrait.jpg';
  const fn = firstName || tutor?.display_name || 'Sophia';

  const eyebrow = getValue(content, 'eyebrow');
  const headlineTagline = getValue(content, 'headline_tagline');
  const headline = getValue(content, 'headline');
  const sub = getValue(content, 'sub');
  const primaryCta = getValue(content, 'primary_cta_label');
  const primaryHref = getValue(content, 'primary_cta_href');
  const secondaryCta = getValue(content, 'secondary_cta_label');
  const secondaryHref = getValue(content, 'secondary_cta_href');
  const tertiaryCta = getValue(content, 'tertiary_cta_label');
  const floatLevelLetter = getValue(content, 'float_level_letter');
  const floatLevelTitle = getValue(content, 'float_level_title');
  const floatLevelSub = getValue(content, 'float_level_sub');
  const floatBookingTitle = getValue(content, 'float_booking_title');
  const floatBookingSub = getValue(content, 'float_booking_sub');

  if (!headline) return null;

  const onTrialClick = (e) => {
    if (trial?.pack && onBook) {
      e.preventDefault();
      onBook({ ...trial.pack, isTrial: true });
    }
  };

  return (
    <section className="s-hero">
      <div className="s-wrap">
        <div className="s-hero-copy">
          {eyebrow && <span className="s-eyebrow">{eyebrow}</span>}
          <h1>
            {headlineTagline && <span className="s-hero-tagline">{headlineTagline}</span>}
            {headlineTagline && ' '}
            {renderHeadline(headline)}
          </h1>
          {sub && <p className="s-hero-sub">{sub}</p>}
          <div className="s-hero-ctas">
            {primaryCta && (
              <Link to={primaryHref || '/contact'} className="s-btn s-btn-primary s-btn-lg">
                {primaryCta}
              </Link>
            )}
            {secondaryCta && (
              <a
                href={secondaryHref || '#pricing'}
                className="s-btn s-btn-outline s-btn-lg"
              >
                {secondaryCta}
              </a>
            )}
            {tertiaryCta && trial?.pack && (
              <a
                href="#trial"
                onClick={onTrialClick}
                className="s-btn s-btn-ghost s-btn-lg"
              >
                {tertiaryCta}
              </a>
            )}
          </div>
        </div>
        <div className="s-hero-photo-wrap">
          <InkFlourish />
          <div className="s-hero-photo">
            {imgFailed ? (
              <div className="s-hero-photo-fallback">{fn.charAt(0)}</div>
            ) : (
              <img
                src={photoUrl}
                alt={`${fn}, your teacher`}
                onError={() => setImgFailed(true)}
              />
            )}
          </div>
          {(floatLevelLetter || floatLevelTitle) && (
            <div className="s-hero-float s-hero-float-level">
              {floatLevelLetter && (
                <span className="s-hero-float-glyph">{floatLevelLetter}</span>
              )}
              <span className="s-hero-float-tx">
                {floatLevelTitle && <b>{floatLevelTitle}</b>}
                {floatLevelSub && <small>{floatLevelSub}</small>}
              </span>
            </div>
          )}
          {(floatBookingTitle || floatBookingSub || isAcceptingBookings === false) && (
            <div className={`s-hero-float s-hero-float-booking ${isAcceptingBookings === false ? 's-hero-float-paused' : ''}`}>
              {isAcceptingBookings !== false && (
                <span className="s-hero-float-dot" aria-hidden="true" />
              )}
              <span className="s-hero-float-tx">
                <b>{isAcceptingBookings === false ? 'Not taking new students' : floatBookingTitle}</b>
                {isAcceptingBookings !== false && floatBookingSub && <small>{floatBookingSub}</small>}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroInkwellLiterary;
