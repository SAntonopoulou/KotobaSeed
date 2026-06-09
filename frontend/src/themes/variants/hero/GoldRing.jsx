import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaSun } from 'react-icons/fa6';

// Hero portrait — gold conic-ring + sun decoration + floating
// "alpha" / "live" pills. The visual identity of Greek with Vasso.
//
// Props:
//   content        — admin-editable copy (see contentSchema)
//   tutor          — for portrait fallback + firstName derivation
//   firstName      — already-derived first name (so the variant
//                    doesn't duplicate the parser)
//   trial          — { pack: {...} } or null; when present, the
//                    trial CTA opens the booking dialog
//   onBook(pack)   — open the booking dialog
//
// This variant carries Vasso's exact source treatment (`source:
// /home/sophia/Documents/development/greekvasso HomePage.tsx::Hero`).

// Hero content schema. Only the most essential fallback (a brand-line
// for the headline) has a `default` — every other field stays empty
// unless the tutor fills it in. Variants render whatever's set and
// quietly omit anything that isn't.
export const contentSchema = {
  eyebrow: { type: 'text', max: 80 },
  headline_greek: { type: 'text', max: 80 },
  headline_rest: { type: 'text', max: 120 },
  sub: { type: 'long-text', max: 400 },
  primary_cta_label: { type: 'text', max: 40, default: 'Book a lesson' },
  secondary_cta_label: { type: 'text', max: 40 },
  secondary_cta_href: { type: 'text', max: 200 },
  proof_avatars: { type: 'colors' },
  proof_line: { type: 'text', max: 200 },
  proof_sub: { type: 'text', max: 200 },
  float_alpha_title: { type: 'text', max: 30 },
  float_alpha_sub: { type: 'text', max: 60 },
  float_live_title: { type: 'text', max: 30 },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const HeroGoldRing = ({ content = {}, tutor, firstName, trial, onBook, isAcceptingBookings = true }) => {
  const [imgFailed, setImgFailed] = useState(false);
  // No theme-specific hardcoded fallback — the tutor's photo comes from
  // `tutor.photo_url` (which mirrors User.avatar_url). If they haven't
  // uploaded a photo, the variant falls back to the initial-letter glyph
  // via the `imgFailed` path. Same pattern Dafni + Sophia use.
  const portraitUrl = tutor?.photo_url || null;
  const fn = firstName || tutor?.display_name || 'Tutor';

  const onPrimary = (e) => {
    if (trial?.pack && onBook) {
      e.preventDefault();
      onBook({ ...trial.pack, isTrial: true });
    }
  };

  // Pull every field through getValue and only render what's set.
  // Falls back to a minimal "Learn with <firstName>" headline if the
  // tutor hasn't filled in headline copy yet, so the hero never reads
  // empty.
  const eyebrow = getValue(content, 'eyebrow');
  const headlineGreek = getValue(content, 'headline_greek');
  const headlineRest = getValue(content, 'headline_rest');
  const sub = getValue(content, 'sub');
  const primaryCta = getValue(content, 'primary_cta_label');
  const secondaryCta = getValue(content, 'secondary_cta_label');
  const secondaryHref = getValue(content, 'secondary_cta_href');
  const proofLine = getValue(content, 'proof_line');
  const proofSub = getValue(content, 'proof_sub');
  const avatarColors = getValue(content, 'proof_avatars');
  const floatAlphaTitle = getValue(content, 'float_alpha_title');
  const floatAlphaSub = getValue(content, 'float_alpha_sub');
  const floatLiveTitle = getValue(content, 'float_live_title');
  const hasHeadline = headlineGreek || headlineRest;
  const hasProof = proofLine || proofSub || (avatarColors && avatarColors.length);

  return (
    <section className="hero">
      <div className="sun-deco" />
      <div className="wrap">
        <div className="copy">
          {eyebrow && (
            <span className="eyebrow">
              <FaSun size={16} /> {eyebrow}
            </span>
          )}
          <h1>
            {hasHeadline ? (
              <>
                {headlineGreek && <span className="gr">{headlineGreek}</span>}{' '}
                {headlineRest}
              </>
            ) : (
              <>Learn with {fn}</>
            )}
          </h1>
          {sub && <p className="sub">{sub}</p>}
          <div className="cta">
            <a
              href="#pricing"
              onClick={onPrimary}
              className="v-btn v-btn-gold v-btn-lg"
            >
              {primaryCta}
            </a>
            {secondaryCta && secondaryHref && (
              <Link to={secondaryHref} className="v-btn v-btn-secondary v-btn-lg">
                {secondaryCta}
              </Link>
            )}
          </div>
          {hasProof && (
            <div className="proof">
              {avatarColors && avatarColors.length > 0 && (
                <div className="avs">
                  {avatarColors.map((c, i) => (
                    <span key={`${c}-${i}`} style={{ background: c }} />
                  ))}
                </div>
              )}
              {(proofLine || proofSub) && (
                <small>
                  {proofLine && proofLine.split(/<b>(.*?)<\/b>/).map((seg, i) =>
                    i % 2 ? <b key={i}>{seg}</b> : seg,
                  )}
                  {proofLine && proofSub && <br />}
                  {proofSub}
                </small>
              )}
            </div>
          )}
        </div>
        <div className="portrait-wrap">
          <div className="ring">
            {imgFailed ? (
              <div className="ring-fallback">{fn.charAt(0)}</div>
            ) : (
              <img
                src={portraitUrl}
                alt={`${fn}, your teacher`}
                onError={() => setImgFailed(true)}
              />
            )}
          </div>
          {floatAlphaTitle && (
            <div className="float lvl">
              <span className="lb">α</span>
              <span className="tx">
                <b>{floatAlphaTitle}</b>
                {floatAlphaSub && <small>{floatAlphaSub}</small>}
              </span>
            </div>
          )}
          {(floatLiveTitle || isAcceptingBookings === false) && (
            <div className={`float live ${isAcceptingBookings === false ? 'paused' : ''}`}>
              {isAcceptingBookings !== false && <span className="dot" />}
              <span className="tx">
                <b>{isAcceptingBookings === false ? 'Not taking new students' : floatLiveTitle}</b>
                {isAcceptingBookings !== false && <small>with {fn}</small>}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroGoldRing;
