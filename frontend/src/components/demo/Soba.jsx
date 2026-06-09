import React from 'react';

// Soba — Kotobaseed's onboarding mascot. A soft sprout with two leaves
// and a friendly face. Drawn in the Kotobaseed palette (sage primary +
// honey gold cheeks) so it reads as part of the brand rather than a
// pasted-on cartoon.
//
// Variants:
//   - bob: gentle vertical idle wiggle (default)
//   - flap: tiny tilt back and forth, used during tour transitions
//   - none: still — what prefers-reduced-motion users see
//
// Size scales by setting `size` (px, default 96). Everything else is
// computed from that so we don't have to keep SVG numbers in sync.

const Soba = ({ size = 96, variant = 'bob', className = '' }) => {
  // Honour prefers-reduced-motion at render time. We re-evaluate on
  // every mount which is fine — the matchMedia check is cheap.
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const actualVariant = reduce ? 'none' : variant;

  return (
    <span
      className={
        'inline-block ' +
        (actualVariant === 'bob'
          ? 'animate-[soba-bob_3s_ease-in-out_infinite]'
          : actualVariant === 'flap'
          ? 'animate-[soba-flap_900ms_ease-in-out_infinite]'
          : '') +
        ' ' +
        className
      }
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soil — a thin honey-gold strip below the stem, just a hint
            of where Soba is rooted. */}
        <rect
          x="36"
          y="104"
          width="48"
          height="6"
          rx="3"
          fill="rgb(var(--kotoba-secondary-rgb))"
          opacity="0.35"
        />

        {/* Stem — sage primary, slightly thicker at the base. */}
        <path
          d="M60 108 Q60 80 60 60"
          stroke="rgb(var(--kotoba-primary-rgb))"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />

        {/* Left leaf — slightly tilted, lower */}
        <path
          d="M60 72 Q30 64 24 50 Q34 38 56 50 Q60 60 60 72 Z"
          fill="rgb(var(--kotoba-primary-rgb))"
        />
        <path
          d="M60 72 Q40 66 30 54"
          stroke="rgb(var(--kotoba-primary-rgb))"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.35"
        />

        {/* Right leaf — slightly larger, raised */}
        <path
          d="M60 62 Q90 50 100 32 Q88 22 64 38 Q60 50 60 62 Z"
          fill="rgb(var(--kotoba-primary-rgb))"
        />
        <path
          d="M60 62 Q80 50 92 36"
          stroke="rgb(var(--kotoba-primary-rgb))"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.35"
        />

        {/* Face — sits on the stem just below the leaves' crown */}
        <circle
          cx="60"
          cy="86"
          r="14"
          fill="rgb(var(--kotoba-primary-rgb))"
          opacity="0.96"
        />
        {/* Cheek dots — honey gold */}
        <circle
          cx="51"
          cy="89"
          r="2.4"
          fill="rgb(var(--kotoba-secondary-rgb))"
          opacity="0.85"
        />
        <circle
          cx="69"
          cy="89"
          r="2.4"
          fill="rgb(var(--kotoba-secondary-rgb))"
          opacity="0.85"
        />
        {/* Eyes — small white dots */}
        <circle cx="55" cy="84" r="1.8" fill="#fff" />
        <circle cx="65" cy="84" r="1.8" fill="#fff" />
        {/* Smile */}
        <path
          d="M55 91 Q60 95 65 91"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  );
};

export default Soba;
