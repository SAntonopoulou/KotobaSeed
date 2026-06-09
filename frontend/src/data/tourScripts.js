// Tour scripts — pure data, one per demo role.
//
// Each step:
//   route        — pathname the step belongs to. The engine navigates
//                  here before resolving the target. May be a function
//                  `() => Promise<string|null>` for routes that depend
//                  on runtime data (e.g. the demo draft slug).
//   targetSelector — optional. CSS selector resolved against document
//                    after route mount. If null, the step renders a
//                    centered "stepless" bubble with a scrim.
//   title         — short headline shown in the bubble
//   body          — supporting copy
//   badge         — optional "Free" / "Pro" / "Business" tier label
//   interactive   — when true, the bubble nudges the user to do something
//                   in-page before the Next button advances the tour
//   action        — optional { kind, payload } the engine fires (e.g.
//                   navigate to a seeded item by querying the API for it)

import { resolveDraftArticleEditRoute } from './tourResolvers';

export const tutorTour = [
  {
    id: 'tutor-welcome',
    route: '/dashboard',
    targetSelector: null,
    title: "I'm Soba.",
    body: "I'll show you around in under a minute. Click Skip any time — nothing here is permanent until you set a password.",
  },
  {
    id: 'tutor-sidebar',
    route: '/dashboard',
    targetSelector: '[data-tour="dashboard-sidebar"]',
    title: 'This is your dashboard.',
    body: 'Bookings, lessons, content, your site, your money — all here. Try clicking a section.',
  },
  {
    id: 'tutor-content',
    route: '/dashboard',
    targetSelector: '[data-tour="dashboard-section-content"]',
    title: 'Content lives here.',
    body: 'Articles, modules, your subscription, newsletters. We pre-filled an article you can try editing in a sec.',
    action: { kind: 'click-target' },
  },
  {
    id: 'tutor-edit-title',
    route: resolveDraftArticleEditRoute,
    targetSelector: '[data-tour="article-title-input"]',
    title: 'Try editing the title.',
    body: "We pre-filled a draft for you. Tweak the title — nothing's published until you hit publish.",
    interactive: true,
  },
  {
    id: 'tutor-site',
    route: '/dashboard',
    targetSelector: '[data-tour="dashboard-section-site"]',
    title: 'Your public site.',
    body: 'This is what students see at yourname.kotobaseed.net. You can pick a theme, edit your profile, build the page.',
  },
  {
    id: 'tutor-money',
    route: '/dashboard',
    targetSelector: '[data-tour="dashboard-section-money"]',
    title: 'Money flows through Stripe.',
    body: 'Connect Stripe when you set a password — until then, no payments touch anything real.',
    badge: 'Pro',
  },
  {
    id: 'tutor-finale',
    route: '/dashboard',
    targetSelector: null,
    title: "Ready when you are.",
    body: "Hit Choose a plan at the top whenever you want to keep what you've made. Your seeded examples get cleaned up; your edits stay.",
  },
];

export const creatorTour = [
  {
    id: 'creator-welcome',
    route: '/teacher/dashboard',
    targetSelector: null,
    title: "I'm Soba.",
    body: "I'll show you how the marketplace looks as a creator. Skip any time — nothing here is real until you set a password.",
  },
  {
    id: 'creator-projects',
    route: '/teacher/dashboard',
    targetSelector: '[data-tour="projects-list"]',
    title: 'Your projects live here.',
    body: 'You have two example projects — one still funding, one delivered. Backers, updates, and revenue are tracked per project.',
  },
  {
    id: 'creator-funding',
    route: '/teacher/dashboard',
    targetSelector: '[data-tour="funding-summary"]',
    title: 'Funding adds up here.',
    body: 'When a project hits its goal, pledges convert and you get paid through Stripe Connect. Demo money is fake — real money needs a verified account.',
    badge: 'Business',
  },
  {
    id: 'creator-new-project',
    route: '/teacher/dashboard',
    targetSelector: '[data-tour="new-project-cta"]',
    title: 'Start a new project.',
    body: 'Series, single videos, livestreams — your call. The form walks you through pricing and delivery.',
  },
  {
    id: 'creator-finale',
    route: '/teacher/dashboard',
    targetSelector: null,
    title: "That's the tour.",
    body: "Hit Choose a plan up top to keep this account. Your seeded examples get cleaned out; anything you create stays.",
  },
];

export const studentTour = [
  {
    id: 'student-welcome',
    route: '/discover',
    targetSelector: null,
    title: "I'm Soba.",
    body: "This is how a real student would browse. You're already following one tutor and we left a couple of ratings to show you how it feels.",
  },
  {
    id: 'student-filters',
    route: '/discover',
    targetSelector: '[data-tour="discover-filters"]',
    title: 'Filter by language + level.',
    body: 'Tutors, articles, lesson packs, modules — the same filters narrow each. Try picking a language.',
  },
  {
    id: 'student-following',
    route: '/discover',
    targetSelector: null,
    title: 'You already follow a tutor.',
    body: "We followed one for you and left a rating + comment on their newest article so you can see what that feels like. Find them under your profile to unfollow any time.",
  },
  {
    id: 'student-finale',
    route: '/discover',
    targetSelector: null,
    title: "All yours.",
    body: "Hit Choose a plan up top to keep this account. The seeded ratings + the follow get cleaned out; anything you create from here stays.",
  },
];

export const tourByRole = {
  tutor: tutorTour,
  creator: creatorTour,
  student: studentTour,
};
