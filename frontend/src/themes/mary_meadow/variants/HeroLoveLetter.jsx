import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FloralWreath,
  SleepingCat,
  GardenVineBanner,
  HandDrawnUnderline,
} from '../Motifs';

// Hero — Love Letter (v2).
// Mary-only. Signature moment of Mary's Meadow:
//   - Garden vine SVG banner sweeping across the top of the section
//   - Full floral wreath SVG ring around the oval portrait (the
//     visual moment, equivalent to Vasso's gold conic ring)
//   - Sleeping cat illustration tucked into the lower-left corner
//   - Big handwritten Caveat greeting line that tilts -1.5deg
//   - Hand-drawn underline under the eyebrow text
//   - Honey ribbon banner over the portrait (sweeping fishtail edges)
//   - Floating "Booking now" pill with a soft sage dot

export const contentSchema = {
  eyebrow: { type: 'text', max: 80 },
  greeting: { type: 'text', max: 60, default: 'Dear future student,' },
  headline_pre: { type: 'text', max: 120 },
  headline_serif: { type: 'text', max: 120, hint: 'Italic blush phrase rendered as <em>.' },
  sub: { type: 'long-text', max: 400 },
  primary_cta_label: { type: 'text', max: 40, default: 'Book a free trial' },
  secondary_cta_label: { type: 'text', max: 40 },
  secondary_cta_href: { type: 'text', max: 200 },
  booking_chip_label: { type: 'text', max: 40, default: 'Booking now' },
  signature: { type: 'text', max: 40, default: '— Mary' },
  stamp_label: { type: 'text', max: 30 },
  stamp_sub: { type: 'text', max: 60 },
};

const get = (content, key) =>
  (content && content[key] != null ? content[key] : contentSchema[key]?.default);

const HeroLoveLetter = ({ content = {}, tutor, firstName, trial, onBook, isAcceptingBookings = true }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUrl = tutor?.photo_url || null;
  const fn = firstName || tutor?.display_name || 'Mary';

  const eyebrow = get(content, 'eyebrow');
  const greeting = get(content, 'greeting');
  const headlinePre = get(content, 'headline_pre');
  const headlineSerif = get(content, 'headline_serif');
  const sub = get(content, 'sub');
  const primaryCta = get(content, 'primary_cta_label');
  const secondaryCta = get(content, 'secondary_cta_label');
  const secondaryHref = get(content, 'secondary_cta_href');
  const bookingChip = get(content, 'booking_chip_label');
  const signature = get(content, 'signature');
  const stampLabel = get(content, 'stamp_label');
  const stampSub = get(content, 'stamp_sub');

  const onPrimary = (e) => {
    if (trial?.pack && onBook) {
      e.preventDefault();
      onBook({ ...trial.pack, isTrial: true });
    }
  };

  return (
    <section className="m-hero" id="hero">
      <GardenVineBanner className="m-hero-vine" />
      <SleepingCat className="m-hero-cat" size={180} />
      <div className="m-wrap">
        <div className="m-hero-wrap">
          <div className="m-hero-copy">
            {eyebrow && (
              <span className="m-eyebrow">
                {eyebrow}
                <HandDrawnUnderline className="m-underline" width={140} />
              </span>
            )}
            {greeting && <span className="m-hero-greeting">{greeting}</span>}
            <h1 className="m-hero-headline">
              {headlinePre}
              {headlinePre && headlineSerif && ' '}
              {headlineSerif && <em>{headlineSerif}</em>}
            </h1>
            {sub && <p className="m-hero-sub">{sub}</p>}
            <div className="m-hero-cta">
              <a href="#pricing" onClick={onPrimary} className="m-btn m-btn-primary m-btn-lg">
                {primaryCta}
              </a>
              {secondaryCta && secondaryHref && (
                <Link to={secondaryHref} className="m-btn m-btn-outline m-btn-lg">
                  {secondaryCta}
                </Link>
              )}
            </div>
            {isAcceptingBookings !== false ? (
              <span className="m-hero-chip">
                <span className="m-hero-chip-dot" />
                {bookingChip}
              </span>
            ) : (
              <span className="m-hero-chip">
                <em>Mary isn't taking new students this week</em>
              </span>
            )}
            {signature && <div className="m-hero-signature">{signature}</div>}
          </div>
          <div className="m-hero-portrait">
            <div className="m-hero-wreath" aria-hidden="true">
              <FloralWreath size={460} />
            </div>
            <div className="m-hero-portrait-frame">
              {imgFailed || !photoUrl ? (
                <div className="m-hero-portrait-fb">{fn.charAt(0)}</div>
              ) : (
                <img
                  src={photoUrl}
                  alt={`${fn}, your teacher`}
                  onError={() => setImgFailed(true)}
                />
              )}
            </div>
            {stampLabel && (
              <div className="m-hero-stamp">
                <div>
                  <b>{stampLabel}</b>
                  {stampSub && <small>{stampSub}</small>}
                </div>
              </div>
            )}
            <div className="m-hero-ribbon">{fn}</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroLoveLetter;
