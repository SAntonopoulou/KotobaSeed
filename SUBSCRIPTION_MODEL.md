# Subscription model — does per-tutor still make sense?

**Sophia's question (2026-06-07):** Plus-tier students already get every
tutor's paid content. So what is the per-tutor subscription actually
buying, and should we just drop it?

This is a design memo, not a code change. Goal: surface the trade-offs
clearly enough that you can pick a direction without me writing
implementation diffs you might want to reverse.

---

## What exists today

Two parallel subscription products:

| Product | Who pays | Who collects | What it unlocks |
|---|---|---|---|
| **Plus (€9/mo)** | Student | Platform (Kotobaseed) | Premium articles + premium homework + premium modules across **every** tutor |
| **Tutor subscription** | Student | Tutor (minus platform fee) | The single tutor's premium content + perks the tutor defines |

The Plus tier was added later and was meant to be a "I just want the
content firehose" choice. The per-tutor subscription pre-dates it and
was the original creator monetization story.

## What overlaps

If you take Plus, you currently get:
- Every tutor's premium articles ✓
- Every tutor's premium modules ✓
- Every tutor's premium homework ✓
- Grading credits ✓
- Custom-pace homework grading ✓

So a Plus subscriber who's *also* paying for a per-tutor sub is paying
twice for the same content. The per-tutor sub gives them nothing extra
on the content axis.

## What doesn't overlap

Per-tutor subscriptions today can also include — depending on what each
tutor configures — things Plus doesn't cover:

- A discount on the tutor's paid lessons (the "10% off paid lessons for
  subscribers" bullet some tutors offer).
- Priority booking — "subscribers can book during peak hours that
  non-subscribers see as full."
- Tutor-defined perks like a monthly group call, a Discord invite,
  a printable workbook, etc. — anything the tutor describes in their
  subscription pitch.

These are real differentiators if you want creators to be able to build
a recurring-revenue business on top of the platform.

---

## Three coherent directions

### Direction A — keep both, but make the boundary explicit

Plus stays "all content, platform-wide". Per-tutor subs explicitly
*don't* include content (since Plus covers that for that buyer);
they become a "lesson + perks" subscription instead.

- Per-tutor sub pricing reflects what the tutor's perks are worth, not
  the content (which is already covered by Plus).
- The tutor sees subscribers as their warmest leads: people paying for
  ongoing access to *them*, not the platform.
- Plus stays the easy on-ramp.
- A Plus subscriber on a per-tutor plan is paying for "the relationship"
  not duplicated bits.

**Cost:** Tutors who currently sell "subscribe for my articles" lose
that pitch. Need to rewrite the subscription-plan editor UX to nudge
tutors toward perks (lesson discount %, group call, etc.) rather than
content access.

### Direction B — drop per-tutor entirely, route value through revenue share

Per-tutor subscriptions disappear. Plus is the only sub. Tutors get
paid via a Plus-revenue share keyed to engagement with their content
(views of their premium articles, completions of their premium
modules, etc.).

- Students see one subscription, one price.
- Tutors don't have to set up a subscription product or marketing copy.
- Creators with low engagement earn less; high-engagement creators
  earn more.

**Cost:** A meaningful behaviour change for tutors who already sell
their own sub — we'd be taking away their existing pricing power. Need
a migration plan ("your current subscribers stay grandfathered" or
"we'll cut you cheques for the next N months at your trailing average").
Engagement-share is also non-trivial to build and game-able. This is
the biggest engineering ask.

### Direction C — collapse Plus into a higher tier of per-tutor

Plus becomes "a per-tutor subscription with every tutor". Same UX as
today's per-tutor sub but bills you across the roster.

- Reduces UI surface — there's just one "subscribe" affordance.
- Honest pricing if Plus covers content from every tutor.

**Cost:** Bigger backend changes than A. The Stripe Connect side is
the hardest — Plus revenue currently goes to the platform; redirecting
it to N tutors per month requires a fan-out + reconciliation system
we don't have.

---

## What I'd ship if you said "decide for me"

**A.** It's the smallest user-visible change, doesn't break existing
subscribers, and preserves the creator monetization angle that pulled
Vasso to the platform in the first place. The fix is mostly UX:

1. Strip the "content access" framing from the per-tutor subscription
   editor.
2. Rename it on the tutor side from "Subscription plan" to "Membership
   perks" (or similar — needs your eye for the brand voice).
3. Add a one-line callout to the subscribe page: "Plus already includes
   <tutor>'s articles + modules + homework. This subscription is for
   their lesson discount + perks."
4. Per-tutor sub minimum drops if the tutor's only perk is content
   (since Plus subscribers don't need that part).

No DB migrations. ~2 days of focused work. The other directions are
bigger swings and probably want a second design pass.

---

## Open questions for you

1. Vasso's product narrative is "be free of the language school." Does
   that narrative work better with **A** (tutors can build a recurring
   revenue base) or **B** (the platform pays them on engagement, lower
   friction)?
2. Are there existing per-tutor subscribers we'd be migrating, or is
   this still pre-launch enough that breaking changes are fine?
3. Is the Plus revenue share with creators that **B** implies a
   non-starter for accounting / VAT reasons? (Stripe Tax on subs is
   already enabled; this would be the same shape.)

Pick a direction (or say "more analysis") and I'll write the
implementation plan separately.
