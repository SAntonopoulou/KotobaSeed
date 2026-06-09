import React from 'react';

// Shared SVG motif library for Mary's Meadow.
//
// Every motif is currentColor + thin strokes so it picks up the section's
// CSS color. This lets the SAME wreath sit on a blush background as warm
// rose and on a cream background as sage, without forking the markup.
//
// All motifs are decorative (aria-hidden) — they carry no information
// load, just the cottagecore signature that defines Mary's site.

export const FloralWreath = ({ size = 360, className = '' }) => (
  <svg
    viewBox="0 0 200 200"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
    fill="none"
  >
    {/* Soft circular path that the leaves + flowers cluster around. */}
    <circle cx="100" cy="100" r="78" stroke="currentColor" strokeWidth="0.6" opacity="0.25" />
    {/* Leaves around the wreath */}
    {Array.from({ length: 22 }).map((_, i) => {
      const angle = (i / 22) * 360;
      const rad = (angle * Math.PI) / 180;
      const cx = 100 + Math.cos(rad) * 88;
      const cy = 100 + Math.sin(rad) * 88;
      const rot = angle + 90;
      const skip = i === 0 || i === 11; // small breaks for the ribbon
      if (skip) return null;
      return (
        <g key={`leaf-${i}`} transform={`translate(${cx} ${cy}) rotate(${rot})`}>
          <path
            d="M0 -10 C5 -10 10 -4 10 0 C10 4 5 10 0 10 C-5 10 -10 4 -10 0 C-10 -4 -5 -10 0 -10 Z"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="currentColor"
            fillOpacity="0.08"
            strokeLinejoin="round"
          />
          <path d="M0 -8 L0 8" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
        </g>
      );
    })}
    {/* Tulip flowers — three clusters of three */}
    {[
      [100, 12],
      [188, 100],
      [12, 100],
      [100, 188],
      [156, 156],
      [44, 156],
      [156, 44],
      [44, 44],
    ].map(([cx, cy], i) => (
      <g key={`tulip-${i}`} transform={`translate(${cx} ${cy})`}>
        <path
          d="M0 0 C-6 -8 -3 -16 0 -18 C3 -16 6 -8 0 0 Z"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="var(--brand, #c66578)"
          fillOpacity="0.28"
          strokeLinejoin="round"
        />
        <path d="M0 0 L0 8" stroke="currentColor" strokeWidth="0.9" />
        <circle r="2.2" cx="0" cy="-12" fill="var(--accent, #d9a856)" fillOpacity="0.65" />
      </g>
    ))}
    {/* Small berries scattered */}
    {[
      [136, 50, 2.4],
      [60, 60, 2.0],
      [150, 140, 2.4],
      [50, 140, 2.0],
      [100, 30, 1.8],
      [100, 170, 1.8],
    ].map(([cx, cy, r], i) => (
      <circle key={`berry-${i}`} cx={cx} cy={cy} r={r} fill="currentColor" opacity="0.55" />
    ))}
  </svg>
);

export const SleepingCat = ({ size = 140, className = '' }) => (
  <svg
    viewBox="0 0 200 120"
    width={size}
    height={size * 0.6}
    className={className}
    aria-hidden="true"
    fill="none"
  >
    {/* Curled body — one continuous gentle curve */}
    <path
      d="M30 92 C 30 56 70 38 110 38 C 150 38 178 56 178 84 C 178 100 162 110 140 110 L 60 110 C 40 110 30 104 30 92 Z"
      stroke="currentColor"
      strokeWidth="2.2"
      fill="currentColor"
      fillOpacity="0.06"
      strokeLinejoin="round"
    />
    {/* Tail curled around the body */}
    <path
      d="M178 84 C 196 80 196 60 180 50 C 168 44 152 48 148 60"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />
    {/* Ear left */}
    <path
      d="M52 56 L 44 36 L 70 50"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.06"
    />
    {/* Ear right */}
    <path
      d="M78 46 L 76 28 L 96 44"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.06"
    />
    {/* Closed eye — a small arc, sleeping */}
    <path d="M52 64 C 56 67 60 67 64 64" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    {/* Whiskers — three soft strokes */}
    <path d="M44 76 L 30 74" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    <path d="M44 80 L 28 82" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    <path d="M44 84 L 30 90" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    {/* Nose dot */}
    <circle cx="46" cy="74" r="1.6" fill="currentColor" />
    {/* zzz floating sleep marks */}
    <g transform="translate(110 14) rotate(-8)">
      <path d="M0 0 L 12 0 L 0 14 L 12 14" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
    </g>
    <g transform="translate(128 4) rotate(-8) scale(0.7)">
      <path d="M0 0 L 12 0 L 0 14 L 12 14" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
    </g>
  </svg>
);

export const PostageStamp = ({ label = '01', size = 64, className = '' }) => (
  <svg
    viewBox="0 0 80 80"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
  >
    <defs>
      <mask id={`stampMask-${label}`}>
        <rect width="80" height="80" fill="white" />
        {Array.from({ length: 12 }).map((_, i) => (
          <circle key={`top-${i}`} cx={(i + 0.5) * (80 / 12)} cy="0" r="2.6" fill="black" />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <circle key={`bot-${i}`} cx={(i + 0.5) * (80 / 12)} cy="80" r="2.6" fill="black" />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <circle key={`lft-${i}`} cy={(i + 0.5) * (80 / 12)} cx="0" r="2.6" fill="black" />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <circle key={`rgt-${i}`} cy={(i + 0.5) * (80 / 12)} cx="80" r="2.6" fill="black" />
        ))}
      </mask>
    </defs>
    <rect width="80" height="80" fill="var(--accent)" mask={`url(#stampMask-${label})`} />
    <rect x="6" y="6" width="68" height="68" fill="none" stroke="var(--surface)" strokeWidth="1.2" mask={`url(#stampMask-${label})`} />
    <text
      x="40"
      y="50"
      fontFamily="DM Serif Display, serif"
      fontSize="28"
      fontStyle="italic"
      textAnchor="middle"
      fill="var(--surface)"
      mask={`url(#stampMask-${label})`}
    >
      {label}
    </text>
  </svg>
);

export const TulipSprig = ({ size = 28, className = '' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" fill="none">
    <path d="M12 22 L 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path
      d="M12 12 C 6 6 4 4 6 4 C 8 4 11 8 12 12 Z"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="currentColor"
      fillOpacity="0.18"
      strokeLinejoin="round"
    />
    <path
      d="M12 12 C 18 6 20 4 18 4 C 16 4 13 8 12 12 Z"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="currentColor"
      fillOpacity="0.18"
      strokeLinejoin="round"
    />
    <path
      d="M12 9 C 12 4 13 2 14 2 C 14 5 13 8 12 9 Z"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="currentColor"
      fillOpacity="0.35"
      strokeLinejoin="round"
    />
    <path d="M8 18 C 6 17 4 17 3 18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M16 18 C 18 17 20 17 21 18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const TeaCup = ({ size = 48, className = '' }) => (
  <svg viewBox="0 0 60 60" width={size} height={size} className={className} aria-hidden="true" fill="none">
    {/* Saucer */}
    <ellipse cx="30" cy="48" rx="22" ry="4" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.06" />
    {/* Cup body */}
    <path d="M12 30 L 14 46 C 14 48 16 50 18 50 L 38 50 C 40 50 42 48 42 46 L 44 30 Z" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity="0.06" strokeLinejoin="round" />
    {/* Handle */}
    <path d="M44 34 C 50 34 52 38 52 42 C 52 46 50 48 44 48" stroke="currentColor" strokeWidth="1.6" fill="none" />
    {/* Steam swirls */}
    <path d="M22 22 C 18 18 22 14 26 12" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <path d="M30 18 C 26 12 32 8 34 6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <path d="M36 22 C 40 18 38 14 36 12" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </svg>
);

export const HandDrawnUnderline = ({ width = 180, className = '' }) => (
  <svg viewBox="0 0 200 16" width={width} height={width * 0.08} className={className} aria-hidden="true" fill="none">
    <path
      d="M4 10 C 30 4 80 12 120 6 C 150 2 180 8 196 6"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

export const GardenVineBanner = ({ className = '' }) => (
  <svg viewBox="0 0 1200 320" className={className} aria-hidden="true" fill="none" preserveAspectRatio="none">
    <path
      d="M-20 260 C 180 140 320 220 500 130 C 660 50 820 90 1020 30 C 1080 12 1140 8 1220 14"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    {[
      [180, 215, -22],
      [300, 175, 16],
      [430, 165, -14],
      [560, 125, 22],
      [690, 90, -18],
      [820, 70, 16],
      [950, 45, -22],
      [1080, 22, 14],
    ].map(([cx, cy, rot], i) => (
      <g key={i} transform={`translate(${cx} ${cy}) rotate(${rot})`}>
        <path
          d="M0 0 C8 -14 22 -20 36 -16 C32 -2 22 8 6 12 Z"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="currentColor"
          fillOpacity="0.18"
          strokeLinejoin="round"
        />
        <path d="M0 0 L26 -14" stroke="currentColor" strokeWidth="0.8" opacity="0.45" />
      </g>
    ))}
    {[
      [380, 165, 4],
      [620, 110, 4.5],
      [880, 60, 4],
      [1040, 28, 3.5],
    ].map(([cx, cy, r], i) => (
      <g key={`f${i}`} transform={`translate(${cx} ${cy})`}>
        <circle r={r} fill="var(--brand)" opacity="0.4" />
        <circle r={r * 0.45} fill="var(--accent)" opacity="0.75" />
      </g>
    ))}
  </svg>
);

export const WashiTape = ({ color = 'honey', width = 96, className = '' }) => {
  const colorMap = {
    honey: { bg: 'rgba(217, 168, 86, 0.55)', stroke: 'rgba(189, 138, 58, 0.65)' },
    blush: { bg: 'rgba(198, 101, 120, 0.45)', stroke: 'rgba(168, 77, 96, 0.6)' },
    sage: { bg: 'rgba(147, 168, 143, 0.5)', stroke: 'rgba(118, 138, 114, 0.65)' },
    lavender: { bg: 'rgba(181, 164, 212, 0.5)', stroke: 'rgba(150, 132, 184, 0.65)' },
  };
  const c = colorMap[color] || colorMap.honey;
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        width,
        height: 22,
        background: c.bg,
        borderLeft: `1px dashed ${c.stroke}`,
        borderRight: `1px dashed ${c.stroke}`,
        boxShadow: '0 2px 4px rgba(58, 71, 51, 0.12)',
      }}
      aria-hidden="true"
    />
  );
};
