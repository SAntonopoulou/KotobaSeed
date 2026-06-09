import React from 'react';
import { useTenantTutor } from './useTenantTutor';

// ThemedRoute — picks a per-route component based on the current
// tenant's tutor theme.
//
// Two APIs:
//   <ThemedRoute themes={{ 'custom-vasso': V, 'custom-dafni': D }}
//                fallback={Default} />
//     — preferred. Picks by exact theme_key match.
//
//   <ThemedRoute vassoGreek={V} fallback={Default} />
//     — legacy alias. Treats 'vasso-greek' and any 'custom-*' theme
//       as routing through `vassoGreek`. Kept for routes that haven't
//       been migrated to a multi-theme map yet.
//
// Loading state renders nothing — the default page would do the same
// while its internal fetch resolves.

const ThemedRoute = ({ themes, vassoGreek: VassoGreek, fallback: Fallback }) => {
  const { tutor, loading } = useTenantTutor();

  if (loading) return null;
  const theme = tutor?.theme;

  // Preferred path: map of theme_key → component. Exact match wins;
  // any tenant whose theme isn't in the map falls through to default.
  if (themes && typeof theme === 'string' && themes[theme]) {
    const Comp = themes[theme];
    return <Comp tutor={tutor} />;
  }

  // Legacy path — route any custom-* tenant or 'vasso-greek' through
  // the supplied Vasso component. Used only by routes that haven't
  // been migrated to a per-theme map yet.
  if (VassoGreek) {
    const matches =
      theme === 'vasso-greek' ||
      (typeof theme === 'string' && theme.startsWith('custom-'));
    if (matches) {
      return <VassoGreek tutor={tutor} />;
    }
  }

  return <Fallback />;
};

export default ThemedRoute;
