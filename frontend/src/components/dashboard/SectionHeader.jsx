import React from 'react';

const SectionHeader = ({ title, description }) => (
  <header className="mb-2">
    <h1 className="text-2xl font-bold text-kotoba-primary">{title}</h1>
    {description && (
      <p className="mt-1 text-sm text-kotoba-text/70 max-w-2xl">{description}</p>
    )}
  </header>
);

export default SectionHeader;
