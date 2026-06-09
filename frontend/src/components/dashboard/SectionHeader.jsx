import React from 'react';

// Used at the top of each dashboard panel. Kept tight (not magazine-sized)
// because the dashboard prioritises density — Sophia's call during the
// 2026-06-07 modernization sweep.

const SectionHeader = ({ title, description, eyebrow }) => (
  <header className="mb-2">
    {eyebrow && (
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark mb-1">
        {eyebrow}
      </p>
    )}
    <h1 className="font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
      {title}
    </h1>
    {description && (
      <p className="mt-2 text-sm text-kotoba-text/75 max-w-2xl leading-relaxed">
        {description}
      </p>
    )}
  </header>
);

export default SectionHeader;
