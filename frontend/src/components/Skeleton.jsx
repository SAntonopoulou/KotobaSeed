import React from 'react';

// Shimmer placeholders for loading states. Three exports:
//   <Skeleton />            — a single bar of arbitrary width/height
//   <SkeletonText lines={N} /> — stacked text-line skeletons
//   <SkeletonCard />        — a card-shaped block with title + a few rows
//
// All keyed on tailwind animate-pulse so the visual cue is consistent.

export const Skeleton = ({ className = '', style }) => (
  <div
    aria-hidden="true"
    className={`bg-kotoba-text/10 rounded animate-pulse ${className}`}
    style={style}
  />
);

export const SkeletonText = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className={`h-3 ${
          i === lines - 1 ? 'w-2/3' : 'w-full'
        }`}
      />
    ))}
  </div>
);

export const SkeletonCard = ({ rows = 3, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-sm p-6 space-y-4 ${className}`}>
    <Skeleton className="h-5 w-1/3" />
    <Skeleton className="h-3 w-2/3" />
    <div className="space-y-2 pt-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  </div>
);

export default Skeleton;
