// Tutor onboarding reference.
//
// This is the long-form reading material that mirrors the interactive
// dashboard tour (components/tutor-tour/TutorTour.jsx). Same coverage,
// different format — read top-to-bottom when you have 20 minutes, or
// jump to a chapter when you forget how something works.
//
// Copy lives here (frontend, not the backend) so we can iterate without
// a migration. Keys are stable strings used by deep links.
//
// `tryIt` deep-links into the tutor dashboard. The wizard helper resolves
// the URL to the tenant subdomain at click time.

export const MODULES = [
  // ----------------------------------------------------------------------
  {
    key: 'welcome',
    title: 'Welcome to Kotobaseed',
    summary: 'Orientation before you dig in.',
    sections: [
      {
        heading: 'What this platform is for',
        body: `Kotobaseed gives independent language tutors a complete shopfront and back office in one place. Your students book lessons on your own subdomain (\`{slug}.kotobaseed.net\`), they pay you directly through Stripe Connect, and you manage every lesson, every piece of homework, every newsletter, every euro — from one dashboard.`,
      },
      {
        heading: 'The interactive tour',
        body: `When you first land on your dashboard, a guided tour walks you through every section. A mascot pops up, highlights what you're looking at, and explains it in two sentences. You can skip at any time or replay it from the "Restart tour" button at the top right of the dashboard. This document covers the same ground, just as scrollable reference.`,
      },
      {
        heading: 'What a typical week looks like',
        body: `Open your dashboard. The overview shows your next lesson with a countdown. Fifteen minutes before, click "Join classroom" — you're in a Daily.co video room with the student. Mark the lesson complete when you're done. Between lessons you publish an article, grade homework, set up next week's availability, tweak your prices. Everything lives one tab away.`,
      },
      {
        heading: 'How to read this guide',
        body: `Each section below is a self-contained chapter — read top-to-bottom on day one, or jump to whatever you need later. "Try it now" buttons drop you into the real dashboard surface the chapter is talking about. Your progress is local-only (no streaks, no leaderboard — just stable reading).`,
      },
    ],
  },

  // ----------------------------------------------------------------------
  {
    key: 'stripe_connect',
    title: 'Get paid: Stripe Connect',
    summary: 'Connect your bank to receive payouts.',
    sections: [
      {
        heading: 'Why Stripe?',
        body: `Every payment your students make flows through Stripe directly into your bank account. Kotobaseed never touches your money — that's the whole point of Stripe Connect. Stripe handles cards, refunds, tax forms, fraud, currency conversion. You get the parts you actually care about: the lesson and the payout.`,
      },
      {
        heading: 'What you need',
        body: `A government ID (passport or driver's licence), your bank account details, and about 10 minutes. Stripe Connect's "Express" flow handles the rest. Stripe verifies you within a day or two; you can keep setting other things up while you wait.`,
      },
      {
        heading: 'How to start',
        body: `From the dashboard's Money section, click "Connect Stripe to receive payouts". You'll be redirected to Stripe's hosted onboarding, fill in your details, then bounce back here. Once Stripe confirms you're verified, your bookings and payments turn on automatically. You'll see your Stripe account ID in the Money section after the round-trip.`,
      },
      {
        heading: 'Where to manage Stripe afterwards',
        body: `Click "Open my Stripe dashboard" from the Money section. That generates a one-time login link that drops you straight into your Stripe Express account — change bank details, see payout schedules, review fees. Never go to dashboard.stripe.com directly; the login link is the only way to land in YOUR account from here.`,
      },
    ],
    tryIt: { label: 'Open the Money section', path: '/dashboard#money' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'subscription_tier',
    title: 'Your subscription tier',
    summary: 'What you get, what each tier unlocks.',
    sections: [
      {
        heading: 'Four tiers',
        body: `Free, Plus, Pro, and Business. The Money tab shows you which one you're on with a coloured pill badge — gray for Free, blue for Plus, amber for Pro, purple for Business. Click "Manage plan" / "View plans" to upgrade or downgrade.`,
      },
      {
        heading: 'What each tier unlocks',
        body: `Free gives you a basic tenant subdomain with sage default colours, up to 240 monthly classroom minutes (~4 hours). Plus adds 600 min/mo (~10 hrs) and removes most platform limits. Pro adds 3000 min/mo (~50 hrs), custom themes, the page builder, custom domain, lower platform fees. Business adds 15000 min/mo (~250 hrs), team seats for language schools, and 0% lesson fees.`,
      },
      {
        heading: 'The monthly minute pool',
        body: `Your "minutes" are classroom-room-minutes per month — Daily.co charges us by the minute, so we cap it. The Bookings section shows a usage bar; you can also buy minute-pack top-ups if a busy month pushes you over. Solo tutors have their own pool; Business teams share one pool across all seats.`,
      },
      {
        heading: 'Renewal + downgrade',
        body: `Your tier renews monthly unless you cancel through "Manage plan". A downgrade kicks in at the END of your current billing month — you keep the higher tier's features until then.`,
      },
    ],
    tryIt: { label: 'Open the Money section', path: '/dashboard#money' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'profile',
    title: 'Your profile + public site',
    summary: 'Name, bio, photo, languages, timezone.',
    sections: [
      {
        heading: 'First impressions',
        body: `Your public site is the first thing a prospective student sees. A clear photo, a warm bio, and a list of the languages you teach do most of the work. Don't overthink the wording — write the way you'd introduce yourself to a friend who's curious about lessons.`,
      },
      {
        heading: 'What to fill in',
        body: `Open Site → your profile. Display name (the brand name students see — can differ from your legal name), languages you teach, a short bio (a paragraph is plenty), a photo of you, your spoken language(s). The Theme picker and Page builder let you do more later; these basics are what every visitor lands on first.`,
      },
      {
        heading: 'Your timezone — important',
        body: `Set your timezone in Settings (not Profile). All your availability windows are stored in this timezone. Students see lesson times converted to THEIR browser timezone automatically — so you never have to translate. If you move, change your timezone and your existing availability windows shift with you.`,
      },
      {
        heading: 'Languages you teach',
        body: `Used for marketplace search + filtering. List the ones you actually teach to a paying-student standard. Verified credentials (covered later) put a small badge next to each.`,
      },
    ],
    tryIt: { label: 'Edit your profile', path: '/dashboard#site' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'themes',
    title: 'Themes — your site\'s look',
    summary: 'Default themes + bespoke custom themes.',
    sections: [
      {
        heading: 'Default themes',
        body: `Six preset colour palettes: Sage (the Kotobaseed default), Midnight study, Sakura, Sunlight, Aegean, Slate. Pro and Business tutors can swap between them from Site → Theme. Free and Plus stay on Sage — saves you decision-fatigue while you focus on lessons.`,
      },
      {
        heading: 'Custom bespoke themes',
        body: `Pro and Business tutors can commission a fully custom theme — a complete design pack with its own palette, fonts, layout, and signature visual moments. These cost €1700+ one-off, ship with their own variant components, and only appear in YOUR theme picker (never universally). Three premier tutors currently run custom themes: Vasso (Greek gold + aegean), Dafni (warm botanical), and Sophia (inkwell navy + coral).`,
      },
      {
        heading: 'How a custom theme is built',
        body: `Sophia or a designer she partners with works with you on a Figma direction, then ships the implemented theme into the platform. You receive the theme key (e.g. \`custom-yourname\`) and the picker shows it for your account only. The theme covers everything — landing page, login, articles, modules, booking dialog, classroom — so the experience feels seamless from your site to a student's lesson.`,
      },
      {
        heading: 'When custom is worth it',
        body: `If you're investing in your tutor brand for the long haul (premium pricing, language school, content platform), a custom theme is the cheapest way to distinguish yourself in search results. If you're just starting out, the default themes are fine — upgrade later when revenue justifies it.`,
      },
    ],
    tryIt: { label: 'Theme picker', path: '/dashboard#site' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'page_builder',
    title: 'Page builder — shape your landing',
    summary: 'Reorder sections, edit copy, no code.',
    sections: [
      {
        heading: 'What the page builder does',
        body: `Open Site → Page builder. Your landing page is a sequence of "sections" (hero, features, levels, pricing, about, reviews). The builder lets you reorder them, edit their content, or hide any section that doesn't fit. Pro and Business tier.`,
      },
      {
        heading: 'Editable per section',
        body: `Each section has its own little form. Hero takes a headline, sub-line, CTAs. Features take a 3-step "how lessons work" list. Levels take CEFR-style tiers (Beginner / Intermediate / Advanced). Pricing pulls live from your lesson packs (you don't type prices in the builder). About is your long-form bio. Reviews are your testimonials.`,
      },
      {
        heading: 'How custom themes interact with the builder',
        body: `Bespoke custom themes ship with their own pre-picked variant for each section type (e.g. Dafni's hero uses editorial-warm, Vasso's uses gold-ring). You can still edit the CONTENT (your headline, your bullets) but the visual treatment is locked to the variant the designer chose. Default themes let you swap variants more freely.`,
      },
      {
        heading: 'Preview + publish',
        body: `Changes save as draft. Click "Preview" to open your live site in a new tab and confirm it looks right. Click "Publish" to make it visible to visitors. Drafts never affect the live site until you publish.`,
      },
    ],
    tryIt: { label: 'Open the page builder', path: '/dashboard#site' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'lesson_pricing',
    title: 'Lesson pricing — single, packs, plan',
    summary: 'How students pay for time with you.',
    sections: [
      {
        heading: 'Three things students can buy',
        body: `(1) A single lesson — pay-as-you-go, one off. (2) A lesson pack — bulk-buy several lessons at a discount, use whenever. (3) A monthly subscription plan — students pay every month for a set number of lessons + your premium content. You can run any combination of the three.`,
      },
      {
        heading: 'Setting a single lesson',
        body: `From Lessons → Single lesson, set the duration (typically 45 or 60 minutes), the price, and the currency. Students see "Book a single lesson" on your pricing section.`,
      },
      {
        heading: 'Setting a lesson pack',
        body: `From Lessons → Lesson packs, click "New pack". Give it a name ("5-pack", "Conversation hour ×3"), the number of lessons, the duration of each, total price, and currency. You can run multiple packs — students see all of them on your site.`,
      },
      {
        heading: 'Setting the monthly subscription plan',
        body: `From Content → Subscription plan, set up your premium plan: name, monthly price, optionally how many lessons per month it includes. Plan subscribers also see your subscriber-only articles + modules. Plan cancels at the end of the current billing month.`,
      },
      {
        heading: 'Platform fees',
        body: `Kotobaseed takes a small percentage of every lesson booking and content sale to cover platform costs. The fee scales DOWN as you go up tiers: Free + Plus pay 10%, Pro pays 5%, Business pays 0%. Subscription tier fees are charged separately from your monthly subscription cost.`,
      },
    ],
    tryIt: { label: 'Manage pricing', path: '/dashboard#lessons' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'free_trial',
    title: 'Free trial — optional but recommended',
    summary: 'Remove "is this tutor right for me?" friction.',
    sections: [
      {
        heading: 'Why offer a trial',
        body: `A 15- or 20-minute free trial removes the "is this tutor right for me?" friction. Most prospective students convert to paying after a trial. It's the single best top-of-funnel lever a tutor has.`,
      },
      {
        heading: 'How to turn it on',
        body: `From Lessons → Trial settings, toggle "Offer a free trial" on. Set the duration (15 or 20 min is typical). Your pricing section auto-adds a "Free trial lesson" card with the distinctive trial styling (themed differently per pack).`,
      },
      {
        heading: 'How it\'s protected',
        body: `One trial per student per tutor, ever. They can't game it. You set which time windows are trial-eligible from the availability editor so peak hours stay paid-only. The monthly minute pool counts trials the same as paid lessons — keeps your Daily.co bill bounded.`,
      },
      {
        heading: 'After the trial',
        body: `The platform doesn't auto-nudge them. Send a personal message in the inbox right after the trial — "Loved teaching you today. Want to book a full lesson?" works better than any automated email.`,
      },
    ],
    tryIt: { label: 'Trial settings', path: '/dashboard#lessons' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'availability',
    title: 'Availability — when can students book',
    summary: 'Weekly windows, timezone, cancellation policy.',
    sections: [
      {
        heading: 'Set weekly windows',
        body: `From Lessons → Availability, pick the days and hours each week you're willing to teach. Students can only book inside those windows. The grid shows a full 24-hour day so you can teach across timezones if needed.`,
      },
      {
        heading: 'Timezone',
        body: `Times are shown in YOUR account timezone (set in Settings). Students see the same slots converted to their browser's local timezone automatically. The booking dialog labels each slot with the student's local time so there's never confusion.`,
      },
      {
        heading: 'Cancellation policy',
        body: `From Lessons → Cancellation, set how many hours' notice you require for a cancellation. Anything closer than that, the student is responsible for. Most tutors land on 24 or 48 hours.`,
      },
      {
        heading: 'Booking lead time',
        body: `Set the minimum hours ahead a student must book — prevents "in 30 minutes!" panic bookings. 2 hours is a sensible default.`,
      },
      {
        heading: 'Vacation / time off',
        body: `Edit your weekly windows for the affected weeks. There's no separate vacation calendar — editing the same grid is faster and there's no risk of "I forgot to turn vacation off".`,
      },
    ],
    tryIt: { label: 'Edit availability', path: '/dashboard#lessons' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'demo_classroom',
    title: 'Demo classroom — practice the room',
    summary: 'Test camera, mic, screen-share before real lessons.',
    sections: [
      {
        heading: 'Why it exists',
        body: `New tutors don't know what the Daily.co classroom feels like until they're in a real lesson — which is the wrong time to discover that your mic is muted by default or screen-share asks for a permission. The demo classroom is a private room you can open any time to get comfortable.`,
      },
      {
        heading: 'How to open one',
        body: `From Lessons → Practice classroom, click "Open practice room". A warning modal pops up first — "time you spend here counts against your monthly minute quota same as a real lesson". Daily.co charges by the minute either way. Click through, and you're alone in a fresh classroom with all your controls live.`,
      },
      {
        heading: 'What to test',
        body: `Camera on/off, mic mute, screen-share to a tab + to a whole window, the chat sidebar, the participants panel, fullscreen, virtual background (if you use one). Maybe whiteboard. Spend 5 minutes the first time, then 1 minute before any first lesson with a new student to confirm your hardware is happy.`,
      },
      {
        heading: 'Quota safety',
        body: `If you're over your monthly quota, the platform refuses to open a demo room (the modal explains why). Time you spend in there is tracked at 1-minute granularity. Close the tab when you're done — heartbeat stops, no more minutes consumed.`,
      },
    ],
    tryIt: { label: 'Practice classroom', path: '/dashboard#lessons' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'bookings',
    title: 'Bookings — manage upcoming + past',
    summary: 'Where lessons live.',
    sections: [
      {
        heading: 'The Bookings tab',
        body: `Open Bookings to see every confirmed lesson — upcoming first, then past, with completed/cancelled/no-show clearly marked. Each row shows the student, the time (in your timezone), the duration, the pack, and any homework or notes attached.`,
      },
      {
        heading: 'Join classroom',
        body: `Fifteen minutes before a lesson, the "Join classroom" button lights up on the next row. Click it. You're in a Daily.co video room with the student.`,
      },
      {
        heading: 'Mark complete + no-show',
        body: `After a lesson, open the booking row and click "Mark complete". This stamps the lesson done, fires any auto-assigned homework, and unlocks the student's review prompt. If the student didn't show up after a fair wait, "Mark no-show" instead — they're still charged because your time was held, but you and they both have a clear record.`,
      },
      {
        heading: 'Minute usage card',
        body: `The Bookings header shows a usage bar with two tones — "used" (actually-taught minutes) and "reserved" (upcoming minutes). When the bar approaches your monthly cap, plan ahead: buy a minute pack or you'll see the booking dialog start refusing new slots.`,
      },
    ],
    tryIt: { label: 'Open Bookings', path: '/dashboard#bookings' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'classroom_live',
    title: 'In the classroom',
    summary: 'How the Daily.co room actually works.',
    sections: [
      {
        heading: 'What\'s available',
        body: `Camera + mic, screen-share (whole window or a single tab), chat, virtual background, fullscreen, in-call settings, room participants list. Recording is on the roadmap for Pro+ but not yet shipped.`,
      },
      {
        heading: 'Best practice',
        body: `Test your mic + camera in the demo classroom before a NEW student's first lesson. Speak the student's name in the first 5 seconds — it grounds the call and they relax. Share your screen when introducing materials; share a single TAB not the whole window if you have other things open.`,
      },
      {
        heading: 'When something breaks',
        body: `If video lags or audio drops, refresh the page (you'll auto-reconnect). If the student can't get in, ask them to refresh too. If Daily.co itself is down (rare), apologize and reschedule — you can refund the lesson from the booking row.`,
      },
    ],
    tryIt: { label: 'Open Bookings', path: '/dashboard#bookings' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'homework',
    title: 'Homework + grading',
    summary: 'Templates, auto-assign, grading queue.',
    sections: [
      {
        heading: 'Templates are the bricks',
        body: `Build a homework template once — vocabulary, fill-in-the-blank, translation, multi-choice, or open-ended text. Assign it to any student as many times as you want. Edit a template later without affecting work that's already gone out.`,
      },
      {
        heading: 'Auto-assign on lesson complete',
        body: `Toggle "Assign on lesson complete" on a template and every time you mark a lesson complete with that student, they get a fresh copy of that homework. Saves you a click; keeps you from forgetting on tired days.`,
      },
      {
        heading: 'Grading',
        body: `Multi-choice, fill-blank, and vocab questions auto-grade. Open-ended answers land in your Grading queue. Add a per-question score, written feedback, or both. The student gets an email when you publish your review.`,
      },
      {
        heading: 'Plus tier — grading credits',
        body: `Free + Plus tier tutors get a finite number of grading credits per month. Pro and Business have unlimited grading. Heavy graders should upgrade to Pro.`,
      },
    ],
    tryIt: { label: 'Build homework', path: '/dashboard#students' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'content_library',
    title: 'Articles + modules',
    summary: 'Content marketing + paid courses.',
    sections: [
      {
        heading: 'Why content matters',
        body: `Articles are how students find you on Google. Modules are how you turn one-off lessons into a sellable course. Together they make your site feel like a school instead of a calendar.`,
      },
      {
        heading: 'Articles',
        body: `Open Content → Articles → New article. Title, body (rich text), an optional cover image, and a slug. Mark it free (default) or set a price for piecemeal sale (10% platform fee). Public articles go to the marketplace's Discover feed. Each article auto-themes to YOUR theme (no extra styling needed).`,
      },
      {
        heading: 'Modules',
        body: `A module is a sequence of lessons, articles, and homework around a theme — "Beginner Greek week 1", "JLPT N3 prep". Open Content → Modules → New module. Add an image, description, price, and a list of lesson items (each can link to an article, a homework template, or your video). Students who buy a module work through it on their own; the platform tracks their progress.`,
      },
      {
        heading: 'Free vs paid vs subscriber-only',
        body: `Three access levels: public (anyone), Plus subscribers only (premium feed), or buy-to-own (piecemeal or part of a module). The "Plus gate" applies platform-wide and means a single subscription unlocks content from every tutor on the platform — so writing for Plus subscribers builds residual income.`,
      },
      {
        heading: 'Newsletters',
        body: `Content → Newsletters lets you send a campaign to your students. New article? Tell them. New module? Send the buy link. Keep it short — a one-screen email gets more clicks than a three-screen one.`,
      },
    ],
    tryIt: { label: 'Open Content', path: '/dashboard#content' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'students_relations',
    title: 'Students — roster + testimonials',
    summary: 'Who they are, what they\'ve said.',
    sections: [
      {
        heading: 'The roster',
        body: `From Students → My students, see every student who has booked you at least once. Filter by active vs lapsed. Click into a student to see their lesson history, current homework, and any private notes you've left ("loves football references", "shy at first, opens up after 10 min").`,
      },
      {
        heading: 'Testimonials',
        body: `Students get auto-prompted to leave a review after each completed lesson. Reviews land in Students → Testimonials. Approve or hide each one. Approved reviews show on your public site's Reviews section.`,
      },
      {
        heading: 'Placement test (optional)',
        body: `Pro tutors can set up a placement test — a short auto-graded quiz a new student takes BEFORE booking to figure out their level. Streamlines first-lesson planning. From Students → Placement test.`,
      },
    ],
    tryIt: { label: 'Open Students', path: '/dashboard#students' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'language_groups',
    title: 'Language groups + cohorts',
    summary: 'Community features.',
    sections: [
      {
        heading: 'What language groups are',
        body: `A platform-wide community for each language. Greek learners + tutors hang out in the Greek group. Talk shop, ask questions, share resources. Open via the apex Discover → Language groups.`,
      },
      {
        heading: 'Cohort marketplace',
        body: `Tutors can pitch scheduled multi-week cohort programs ("8 weeks of conversational Greek, Tues 7pm"). Students browse + commit; the cohort auto-launches when minimum signups hit. From Content → Cohorts.`,
      },
      {
        heading: 'Leaderboard + badges',
        body: `Students earn badges from completing modules and homework, and from public group participation. Tops of the leaderboard get more marketplace visibility. Tutors don't compete on the leaderboard.`,
      },
    ],
    tryIt: { label: 'Open Content', path: '/dashboard#content' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'business_team',
    title: 'Language schools — team accounts',
    summary: 'For Business tier: multiple tutors, one brand.',
    sections: [
      {
        heading: 'What a team is',
        body: `A Business-tier team groups multiple tutors under one brand. The team owner pays one Business subscription + a small fee per active seat. Team members inherit Business-tier perks (custom themes, 0% lesson fees, big minute pool) without paying for their own subscription.`,
      },
      {
        heading: 'Inviting seats',
        body: `From Site → Team panel, invite tutors by email. They accept via a one-click link, get a tenant subdomain under your team brand (e.g. \`anna.yourschool.kotobaseed.net\`), and you see them in your team roster.`,
      },
      {
        heading: 'Shared minute pool',
        body: `All team members share ONE monthly classroom-minute pool. The pool sizes as: 15000 minutes base + 3000 per extra active seat. A 5-seat team gets 27000 min/mo across all seats. The Bookings widget shows team aggregate usage.`,
      },
      {
        heading: 'Poaching protection',
        body: `When a tutor leaves the team, students they taught while in the team can't book the ex-member directly for a configurable window (default 90 days). Protects your school's client list.`,
      },
    ],
    tryIt: { label: 'Open Team panel', path: '/dashboard#site' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'custom_domain',
    title: 'Custom domain — your own URL',
    summary: 'Pro feature: greekwithyou.com instead of you.kotobaseed.net.',
    sections: [
      {
        heading: 'What a custom domain is',
        body: `Instead of \`{slug}.kotobaseed.net\`, you can use your own domain — \`greekwithyou.com\` for example. Improves brand perception (premium tutors don't want a marketplace subdomain in their URL) and SEO. Pro + Business tier.`,
      },
      {
        heading: 'How to set it up',
        body: `From Site → Custom domain, enter the domain you own. The panel shows you exactly which DNS records to create at your registrar (usually a CNAME pointing to \`tenant.kotobaseed.net\`). Click "Verify" once DNS has propagated (10 minutes to 24 hours). The platform handles HTTPS cert provisioning automatically.`,
      },
      {
        heading: 'Reverting',
        body: `Remove the custom domain at any time and your subdomain stays live — students bookmark either, the redirects flow correctly.`,
      },
    ],
    tryIt: { label: 'Open custom domain', path: '/dashboard#site' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'marketplace_listing',
    title: 'Marketplace listing + cross-link',
    summary: 'Whether students can find you via the apex.',
    sections: [
      {
        heading: 'Marketplace listing',
        body: `From Site → Marketplace, toggle whether you're listed on the apex \`kotobaseed.net/discover\` marketplace. Default ON. Some premium tutors turn it OFF — they drive traffic to their own domain via personal marketing and don't want the marketplace's comparison-shopping context.`,
      },
      {
        heading: 'Cross-link toggle',
        body: `From Site → Cross-link, toggle the small "Browse Kotobaseed" link in your site's footer. Default ON. Turn it off if your brand should feel completely standalone (large language schools, white-label deployments).`,
      },
    ],
    tryIt: { label: 'Marketplace settings', path: '/dashboard#site' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'verifications',
    title: 'Verified credentials + badges',
    summary: 'Pro feature.',
    sections: [
      {
        heading: 'Three kinds of badge',
        body: `Language proficiency (DELE C2, JLPT N1, native speaker certificates), teaching credentials (CELTA, DELTA, degrees), and identity (auto-granted when Stripe Connect onboarding completes). Each verified credential becomes a small pill badge on your public site near your name.`,
      },
      {
        heading: 'How to submit',
        body: `From Site → Verifications, pick a kind, type a one-line description ("DELE C2", "CELTA from Cambridge"), and paste a link to the document. Anything we can open in a browser works — Google Drive, Dropbox, your own site.`,
      },
      {
        heading: 'Review turnaround',
        body: `We aim for within two business days. You'll get an in-app notification when a credential is approved or if we need more info. Approved badges show instantly.`,
      },
    ],
    tryIt: { label: 'Submit a credential', path: '/dashboard#site' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'email_templates',
    title: 'Transactional emails',
    summary: 'What students see from your site.',
    sections: [
      {
        heading: 'What\'s editable',
        body: `From Settings → Email templates, see every transactional email students get from your site: booking confirmation, lesson reminder, homework assigned, lesson cancelled, etc. Override the subject + body of any of them with your own copy.`,
      },
      {
        heading: 'Sensible defaults',
        body: `If you don't override anything, the platform sends warm, friendly defaults in English. Override the ones you care about; leave the rest. Reverting an override is one click.`,
      },
      {
        heading: 'Variables',
        body: `Each template lists the variables available to you ({firstName}, {lessonTime}, etc.). Drop them anywhere in subject or body.`,
      },
    ],
    tryIt: { label: 'Edit email templates', path: '/dashboard#settings' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'account_settings',
    title: 'Account + GDPR',
    summary: 'Timezone, password, data export, delete.',
    sections: [
      {
        heading: 'Timezone (revisit)',
        body: `Settings → Timezone is the most important setting after your bank details. Get it right early. Lesson times derive from this; cron jobs (homework reminders, etc.) use this.`,
      },
      {
        heading: 'Change password',
        body: `Settings → Account → Change password sends a reset link to your registered email. We don't store passwords in plain text and we don't let you set one in-place — the email link confirms you actually own the inbox.`,
      },
      {
        heading: 'Download my data',
        body: `Settings → Your data + privacy → "Download my data" exports a JSON of everything we hold about you: your account, your tutor profile, your students, your articles, your modules, your bookings. GDPR right-of-access in one click.`,
      },
      {
        heading: 'Delete my account',
        body: `Same panel → "Delete my account". Permanently removes your tutor profile, all your content, your subscription. Cannot be undone. Stripe Connect account stays with Stripe — log into Stripe Express separately to close it there if you want a clean break.`,
      },
    ],
    tryIt: { label: 'Open Settings', path: '/dashboard#settings' },
  },

  // ----------------------------------------------------------------------
  {
    key: 'support',
    title: 'Help + community',
    summary: 'Where to go when stuck.',
    sections: [
      {
        heading: 'This guide',
        body: `When you can't remember how to do a specific thing, this guide is the first place to look. Use Ctrl/Cmd-F to find a keyword.`,
      },
      {
        heading: 'The dashboard tour',
        body: `Restart the dashboard tour any time from the "Restart tour" button at the top of your dashboard. Useful after a big platform update when something might have moved.`,
      },
      {
        heading: 'Direct support',
        body: `Open a ticket from the apex Support page (\`kotobaseed.net/support\`). We aim to respond within one business day. Include screenshots + a description of what you expected vs what you saw — speeds things up massively.`,
      },
      {
        heading: 'Status + announcements',
        body: `Check \`kotobaseed.net/status\` for ongoing incidents. Major platform updates land in the platform announcement feed (appears as a banner on your dashboard) so you don't miss anything important.`,
      },
      {
        heading: 'You made it',
        body: `That's the tour. Marking this section complete will stamp you as fully onboarded, but you can revisit any chapter any time, or restart from the beginning whenever you want a refresher. Welcome to Kotobaseed — go teach some students.`,
      },
    ],
  },
];

export const MODULE_COUNT = MODULES.length;
export const MODULE_KEYS = MODULES.map((m) => m.key);

export const moduleByKey = (key) => MODULES.find((m) => m.key === key) || null;

export const nextModule = (currentKey) => {
  const idx = MODULES.findIndex((m) => m.key === currentKey);
  if (idx < 0 || idx === MODULES.length - 1) return null;
  return MODULES[idx + 1];
};

export const previousModule = (currentKey) => {
  const idx = MODULES.findIndex((m) => m.key === currentKey);
  if (idx <= 0) return null;
  return MODULES[idx - 1];
};
