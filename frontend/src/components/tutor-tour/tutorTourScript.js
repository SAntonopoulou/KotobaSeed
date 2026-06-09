// Step script for the first-time tutor onboarding tour. Each step drives
// the dashboard's `#section=...` hash and highlights a specific data-tour
// target on the page. The tour engine is in TutorTour.jsx.
//
// Voice: warm, factual, brief. No emoji, sentence case. Avoid the
// fictional voice ("kindly"/"gently/"running away") per Sophia's rule.

const setSection = (key) => {
  // The dashboard reads its section from the URL hash. Setting hash
  // alone doesn't trigger React, so we also dispatch a hashchange-equivalent
  // — the dashboard listens for it. Setting the hash itself fires the
  // native hashchange event, which the dashboard already wires up.
  if (typeof window === 'undefined') return;
  if (window.location.hash !== `#${key}`) {
    window.location.hash = key;
  }
};

const tutorTourScript = [
  {
    title: 'Welcome to your dashboard',
    body: "I'll walk you through everything in about a minute. You can skip anytime.",
    // Stepless — centred greeting before we point at anything.
    onEnter: () => setSection('overview'),
  },
  {
    title: 'Your control centre',
    body: "Each section on the left is a part of your work — lessons, content, students, your site, money, settings. Click any time to jump.",
    targetSelector: '[data-tour="dashboard-sidebar"]',
    onEnter: () => setSection('overview'),
  },
  {
    title: 'Set when you’re free',
    body: "Open Lessons to set your weekly availability. Students book inside these windows in their own timezone — yours stays in Settings.",
    targetSelector: '[data-tour="tutor-availability"]',
    onEnter: () => setSection('lessons'),
  },
  {
    title: 'Pricing and free trial',
    body: 'A single lesson, a monthly plan, lesson packs, and a free trial. Students see all of these on your site. Configure any of them here.',
    targetSelector: '[data-tour="tutor-pricing"]',
    onEnter: () => setSection('lessons'),
  },
  {
    title: 'Practice your classroom',
    body: "Open a private room to test camera, mic, and screen-share before your first real lesson. Time counts against your monthly quota — keep it short.",
    targetSelector: '[data-tour="tutor-demo-classroom"]',
    onEnter: () => setSection('lessons'),
  },
  {
    title: 'Build a content library',
    body: 'Publish articles and modules to attract students. Free articles bring traffic; paid modules earn you money. Both inherit your theme automatically.',
    targetSelector: '[data-tour="tutor-content"]',
    onEnter: () => setSection('content'),
  },
  {
    title: 'Shape your site',
    body: 'Pick a theme and rearrange your landing page. Pro tier unlocks custom themes and the page builder. Custom domain is here too.',
    targetSelector: '[data-tour="tutor-site"]',
    onEnter: () => setSection('site'),
  },
  {
    title: 'Get paid',
    body: 'Connect Stripe to receive payouts directly to your bank. Upgrade your plan from this tab for more minutes, custom domain, and zero lesson fees.',
    targetSelector: '[data-tour="tutor-money"]',
    onEnter: () => setSection('money'),
  },
  {
    title: 'Your account',
    body: 'Set your timezone, manage transactional emails, export your data, or close your account. Everything respects GDPR.',
    targetSelector: '[data-tour="tutor-settings"]',
    onEnter: () => setSection('settings'),
  },
  {
    title: "You're set",
    body: "That's the tour. You can restart it anytime from the dashboard header. Now go publish something.",
    onEnter: () => setSection('overview'),
  },
];

export default tutorTourScript;
