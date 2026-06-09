import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// Hero — editorial warm.
//
// Dafni-only. The signature moment of the warm-botanical pack:
//   - Large editorial portrait on the right with a soft tilt
//   - A hand-drawn olive-branch motif sweeping behind the photo
//     (uses the same botanical vocabulary as the level cards + features
//     dividers — single visual language across the page)
//   - Two floating pills: a CEFR level badge (terracotta-ringed) and a
//     calm "now booking" indicator (sage tint + sage dot)
//   - Editorial headline with an inline italic-terracotta Greek phrase
//   - Quiet social proof row: cream avatars with a sage rim + one-line
//     ratings/students copy
//   - Three CTAs: send first message (primary), book a lesson (outline),
//     trial lesson (ghost, only when trial pack exists)
//
// All decoration is SVG so it ships in the bundle — no image hosting
// needed. No emoji. Every selector lives under .theme-dafni-botanical-site
// so styles never leak.

export const contentSchema = {
  eyebrow: { type: 'text', max: 80 },
  headline_greek: {
    type: 'text',
    max: 80,
    hint: 'Optional Greek phrase rendered in italic terracotta before the rest of the headline.',
  },
  headline: {
    type: 'long-text',
    max: 200,
    required: true,
    hint: 'Wrap a phrase in <em>...</em> to make it terracotta italic inline.',
  },
  sub: { type: 'long-text', max: 400 },
  primary_cta_label: { type: 'text', max: 40, default: 'Send first message' },
  primary_cta_href: { type: 'text', max: 200, default: '/contact' },
  secondary_cta_label: { type: 'text', max: 40, default: 'Book a lesson' },
  secondary_cta_href: { type: 'text', max: 200, default: '#pricing' },
  tertiary_cta_label: { type: 'text', max: 40, default: 'Trial lesson' },
  tertiary_cta_href: { type: 'text', max: 200 },
  proof_avatars: { type: 'colors' },
  proof_line: { type: 'text', max: 200 },
  proof_sub: { type: 'text', max: 200 },
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

// Headline inline-em parser. Splits on <em>…</em> spans so an editor
// can write "Greek, <em>online and made for your week</em>." and get
// the italic-terracotta fragment without a sanitiser dependency.
function renderHeadline(raw) {
  if (typeof raw !== 'string') return raw;
  const parts = raw.split(/<em>(.*?)<\/em>/g);
  return parts.map((seg, i) => (i % 2 ? <em key={i}>{seg}</em> : seg));
}

// Hand-drawn olive-branch SVG used as the hero's signature backdrop
// behind the photo column. Stroke is sage so it reads botanical
// without screaming. Same vocabulary as the other Dafni variants —
// single visual language end-to-end.
const OliveBranchDecoration = () => (
  <svg
    className="d-hero-branch"
    viewBox="0 0 380 520"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M50 510 C60 420 80 320 130 230 C170 160 220 110 290 80"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    {/* leaf cluster — leaves spaced along the stem in alternation */}
    {[
      [120, 250, -22],
      [150, 200, 18],
      [180, 160, -14],
      [215, 130, 22],
      [250, 110, -16],
      [90, 320, 14],
      [70, 390, -18],
    ].map(([cx, cy, rot], i) => (
      <g key={i} transform={`translate(${cx} ${cy}) rotate(${rot})`}>
        <path
          d="M0 0 C8 -16 22 -22 36 -18 C32 -4 22 8 6 12 Z"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinejoin="round"
        />
        <path
          d="M0 0 L32 -16"
          stroke="currentColor"
          strokeWidth="0.9"
          opacity="0.5"
        />
      </g>
    ))}
    {/* small fruit beads */}
    <circle cx="200" cy="148" r="3.4" fill="currentColor" opacity="0.42" />
    <circle cx="232" cy="124" r="3.4" fill="currentColor" opacity="0.42" />
    <circle cx="265" cy="100" r="3.4" fill="currentColor" opacity="0.42" />
  </svg>
);

// Tiny laurel sprig used as the floating "level" badge glyph — Δ or A1
// reads too generic next to a portrait, so the glyph stays botanical.
const LaurelSprig = () => (
  <svg
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
    style={{ display: 'block' }}
  >
    <path
      d="M14 24 L14 6"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path
      d="M14 12 C10 9 7 8 4 8 C5 11 8 13 13 14"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14 12 C18 9 21 8 24 8 C23 11 20 13 15 14"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14 18 C10 15 7 14 4 14 C5 17 8 19 13 20"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14 18 C18 15 21 14 24 14 C23 17 20 19 15 20"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const HeroEditorialWarm = ({ content = {}, tutor, firstName, trial, onBook, isAcceptingBookings = true }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUrl = tutor?.photo_url || '/dafni-portrait.jpg';
  const fn = firstName || tutor?.display_name || 'Dafni';

  const eyebrow = getValue(content, 'eyebrow');
  const headlineGreek = getValue(content, 'headline_greek');
  const headline = getValue(content, 'headline');
  const sub = getValue(content, 'sub');
  const primaryCta = getValue(content, 'primary_cta_label');
  const primaryHref = getValue(content, 'primary_cta_href');
  const secondaryCta = getValue(content, 'secondary_cta_label');
  const secondaryHref = getValue(content, 'secondary_cta_href');
  const tertiaryCta = getValue(content, 'tertiary_cta_label');
  const proofLine = getValue(content, 'proof_line');
  const proofSub = getValue(content, 'proof_sub');
  const avatarColors = getValue(content, 'proof_avatars');
  const floatLevelLetter = getValue(content, 'float_level_letter');
  const floatLevelTitle = getValue(content, 'float_level_title');
  const floatLevelSub = getValue(content, 'float_level_sub');
  const floatBookingTitle = getValue(content, 'float_booking_title');
  const floatBookingSub = getValue(content, 'float_booking_sub');
  const hasProof = proofLine || proofSub || (avatarColors && avatarColors.length);

  if (!headline) return null;

  const onTrialClick = (e) => {
    if (trial?.pack && onBook) {
      e.preventDefault();
      onBook({ ...trial.pack, isTrial: true });
    }
  };

  return (
    <section className="d-hero">
      <div className="d-wrap">
        <div className="d-hero-copy">
          {eyebrow && <span className="d-eyebrow">{eyebrow}</span>}
          <h1>
            {headlineGreek && <span className="d-hero-greek">{headlineGreek}</span>}
            {headlineGreek && ' '}
            {renderHeadline(headline)}
          </h1>
          {sub && <p className="d-hero-sub">{sub}</p>}
          <div className="d-hero-ctas">
            {primaryCta && (
              <Link to={primaryHref || '/contact'} className="d-btn d-btn-primary d-btn-lg">
                {primaryCta}
              </Link>
            )}
            {secondaryCta && (
              <a
                href={secondaryHref || '#pricing'}
                className="d-btn d-btn-outline d-btn-lg"
              >
                {secondaryCta}
              </a>
            )}
            {tertiaryCta && trial?.pack && (
              <a
                href="#trial"
                onClick={onTrialClick}
                className="d-btn d-btn-ghost d-btn-lg"
              >
                {tertiaryCta}
              </a>
            )}
          </div>
          {hasProof && (
            <div className="d-hero-proof">
              {avatarColors && avatarColors.length > 0 && (
                <div className="d-hero-proof-avs">
                  {avatarColors.slice(0, 5).map((c, i) => (
                    <span key={`${c}-${i}`} style={{ background: c }} />
                  ))}
                </div>
              )}
              {(proofLine || proofSub) && (
                <small>
                  {proofLine &&
                    proofLine
                      .split(/<b>(.*?)<\/b>/)
                      .map((seg, i) => (i % 2 ? <b key={i}>{seg}</b> : seg))}
                  {proofLine && proofSub && <br />}
                  {proofSub}
                </small>
              )}
            </div>
          )}
        </div>
        <div className="d-hero-photo-wrap">
          <OliveBranchDecoration />
          <div className="d-hero-decoration" aria-hidden="true" />
          <div className="d-hero-photo">
            {imgFailed ? (
              <div className="d-hero-photo-fallback">{fn.charAt(0)}</div>
            ) : (
              <img
                src={photoUrl}
                alt={`${fn}, your teacher`}
                onError={() => setImgFailed(true)}
              />
            )}
          </div>
          {(floatLevelLetter || floatLevelTitle) && (
            <div className="d-hero-float d-hero-float-level">
              <span className="d-hero-float-glyph">
                {floatLevelLetter ? (
                  <span className="d-hero-float-letter">{floatLevelLetter}</span>
                ) : (
                  <LaurelSprig />
                )}
              </span>
              <span className="d-hero-float-tx">
                {floatLevelTitle && <b>{floatLevelTitle}</b>}
                {floatLevelSub && <small>{floatLevelSub}</small>}
              </span>
            </div>
          )}
          {(floatBookingTitle || floatBookingSub || isAcceptingBookings === false) && (
            <div className={`d-hero-float d-hero-float-booking ${isAcceptingBookings === false ? 'd-hero-float-paused' : ''}`}>
              {isAcceptingBookings !== false && (
                <span className="d-hero-float-dot" aria-hidden="true" />
              )}
              <span className="d-hero-float-tx">
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

export default HeroEditorialWarm;
