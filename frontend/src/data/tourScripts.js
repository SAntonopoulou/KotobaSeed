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

// Tutor tour — anchored on the three pain points that drive conversion:
//   1. "I'm tired of juggling 3 tools" → calendar + payments + content in one
//      place
//   2. "I want students who actually engage" → curriculum + homework +
//      analytics
//   3. "I want my own brand" → custom site + custom domain + custom theme
// Each stop opens with the pain it solves so the demo prospect hears their
// own complaint reflected back at them, then sees the platform answering it.
export const tutorTour = [
  {
    id: 'tutor-welcome',
    route: '/dashboard',
    targetSelector: null,
    title: "Most tutors juggle a calendar, a payments app, a content tool, and a chat thread.",
    body: "I'll show you how Kotobaseed collapses all of that into one dashboard — in about a minute. Skip any time; nothing's permanent until you choose a plan.",
  },
  {
    id: 'tutor-schedule',
    route: '/dashboard',
    targetSelector: '[data-tour="dashboard-sidebar"]',
    title: 'Your week, already booked.',
    body: 'We pre-filled seven upcoming lessons across three students so you can see what a real Kotobaseed dashboard feels like. Calendar, bookings, and payments are wired into the same row — no copy-pasting student names between tools.',
  },
  {
    id: 'tutor-engagement',
    route: '/dashboard',
    targetSelector: '[data-tour="dashboard-section-content"]',
    title: 'Engaged students, not just attended ones.',
    body: "Lesson plans live next to bookings. Homework auto-assigns when you mark a lesson complete. Modules link to your articles so paid students unlock the material that takes them past your free tier.",
    action: { kind: 'click-target' },
  },
  {
    id: 'tutor-edit-title',
    route: resolveDraftArticleEditRoute,
    targetSelector: '[data-tour="article-title-input"]',
    title: 'Try editing the title.',
    body: "We pre-filled a draft for you. Tweak the title to make it yours — nothing publishes until you hit publish, and the editor is the same one your finished articles render through.",
    interactive: true,
  },
  {
    id: 'tutor-site',
    route: '/dashboard',
    targetSelector: '[data-tour="dashboard-section-site"]',
    title: 'Your brand, your site.',
    body: "Every student lands at yourname.kotobaseed.net (or your own .com — we provision the cert). Pick a theme, build the page from blocks, hide what doesn't fit. Schools build the same site, only with their team and programmes instead of one tutor's bio.",
  },
  {
    id: 'tutor-money',
    route: '/dashboard',
    targetSelector: '[data-tour="dashboard-section-money"]',
    title: 'Stripe Connect — you keep the relationship.',
    body: "Lessons + modules + premium homework all settle to your own Stripe account. We take a flat platform fee; the rest goes straight to your bank. Connect when you choose a plan; until then nothing real moves.",
    badge: 'Pro',
  },
  {
    id: 'tutor-finale',
    route: '/dashboard',
    targetSelector: null,
    title: "Make this yours.",
    body: "Everything you've edited stays when you convert; the seeded examples get cleaned up. Hit Choose a plan up top whenever you're ready.",
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
