# Kotobaseed Feature Audit

**Date:** 2026-06-05
**Author:** Audit performed by Claude under direction from Sophia after she flagged that "CompInput" should not be treated as legacy — it is the same product as Kotobaseed, renamed internally.

## Purpose

Before we change any data model or delete any column, document **every feature that currently exists in the codebase**, what state it is in, what it depends on, and where it lives. The goal is to consolidate honestly without losing features.

This is a snapshot of code at commit `4286621` (Step 8 completed). All file references are exact.

---

## Plain-English model

Kotobaseed is a language-learning platform with two complementary halves that share the **same user accounts, identity, and messaging**:

1. **Marketplace half** (apex `kotobaseed.net`): crowdfunded comprehensible-input videos. Students request topics, teachers create projects, backers fund them, everyone watches the result. Projects, pledges, requests, videos, ratings, conversations, groups, follow/unfollow, profiles, subscriptions.

2. **Tutor-site half** (subdomain `vasso.kotobaseed.net`): a teacher who wants to run a tutoring business gets their own subdomain, takes one-to-one bookings (not built yet), runs classroom video (not built yet). Stripe Connect for direct payouts.

**Roles:**
- **Student** — has a User row. Browses marketplace, books lessons (TBD), pledges projects, messages teachers. May subscribe to Plus/Premium. Public profile at `/profile/<id>`. **Never has a Tutor row, never has a subdomain.**
- **Teacher (marketplace-only)** — has a User row with `role=TEACHER`. Creates Projects, gets pledges, has a public profile. **No Tutor row, no subdomain.** Existing teachers from CompInput look like this. We should encourage them to convert.
- **Teacher with a tutor site (Tutor)** — same as above, PLUS a Tutor row tied to their User by `user_id`. Has a slug, subdomain, plan, custom domain (Pro plan only). Stripe Connect lives on the Tutor row.
- **Moderator / Admin** — User with elevated role. Admin tools live at `/admin/dashboard` on apex.

**One identity:** the User's `bio`, `avatar_url`, `languages` are the same person whether they appear on a marketplace card, on their tutor subdomain, or in a messaging thread. Editing in one place should update the one source. Currently this is **not true** — see the Data Model section below.

---

## Section 1 — Marketplace (works end-to-end)

### Projects
- **Backend** — `backend/routers/projects.py`
  - `POST /projects/` (line 287) — create
  - `GET /projects/` (376) — list active
  - `GET /projects/archive` (233)
  - `GET /projects/{id}` (454)
  - `GET /projects/me` (432)
  - `PATCH /projects/{id}` (588)
  - `POST /projects/{id}/complete` (625)
  - `POST /projects/{id}/confirm-completion` (682)
  - `POST /projects/{id}/cancel` (744)
  - `GET /projects/filter-options` (212), `GET /projects/{id}/related` (557), `GET /projects/{id}/backers` (546)
  - `POST /projects/{id}/updates` (770), `GET /projects/{id}/updates` (810), `PATCH /projects/updates/{id}` (790)
- **Frontend** — `ProjectList.jsx`, `ProjectDetail.jsx`, `Archive.jsx`, `TeacherArchive.jsx`, `ProjectCard.jsx`, `teacher/CreateProject.jsx`, `teacher/EditProject.jsx`, `teacher/Dashboard.jsx`, `student/Dashboard.jsx`, `student/Archive.jsx`
- **Status:** ✅ Working — full FUNDING → SUCCESSFUL → PENDING_CONFIRMATION → COMPLETED lifecycle
- **Reads User columns:** `avatar_url` (ProjectRead schema, ProjectCard), `stripe_account_id` (payout destination), `charges_enabled` / `payouts_enabled` (capability flags)
- **Multi-tenant:** cross-tenant (marketplace-wide, scopes by `User.id` not Tutor)
- **Notes:**
  - `projects.py:324-341` creates a LanguageGroup if not exists — no atomic check; concurrent writes for the same language could race
  - Series projects (`num_videos > 1`) require exact video count match at completion — strict, no admin override

### Pledges
- **Backend** — `backend/routers/pledges.py`
  - `POST /pledges/` (60) — create + Stripe Checkout session
  - `GET /pledges/me` (118), `GET /pledges/user/{id}` (160)
  - `POST /pledges/webhook` (304) — Stripe webhook, handles `checkout.session.completed`, `account.updated`, `charge.refunded`
- **Frontend** — `PledgeForm.jsx`, `ProjectDetail.jsx`, `student/Dashboard.jsx`
- **Status:** ✅ Working — pledge lifecycle solid
- **Reads User columns:** `stripe_account_id` (Connect destination)
- **`handle_account_updated` (pledges.py:254-282) already supports both paths:** legacy `User.stripe_account_id` AND new `Tutor.stripe_connect_account_id`. This is the pattern to mirror elsewhere.
- **Bug:** tip amount added to `project.total_tipped_amount` without idempotency check (line 191) — webhook retry could double-count

### Requests
- **Backend** — `backend/routers/requests.py`
  - `POST /requests/` (51), `GET /requests/` (106), `POST /requests/{id}/cancel` (199)
- **Frontend** — `RequestList.jsx`
- **Status:** ⚠️ Partially built — counter-offer / accept-offer / reject-offer endpoints exist but are **commented out** (lines 322-511). Acceptance flow happens via conversations instead.
- **Priority credit integration:** `requests.py:66-83` accepts `use_priority_credit=true` but the flow that consumes it lives in `conversations.py:651-669` (when accepting an offer).

### Videos
- **Backend** — `backend/routers/videos.py`
  - `POST /videos/` (77), `GET /videos/` (186)
  - `POST /videos/{id}/comments` (241), `GET /videos/{id}/comments` (266)
  - `POST /videos/{id}/resources` (165)
- **Frontend** — `LinkVideoModal.jsx`, `VideoPlayer.jsx`, `ProjectDetail.jsx`, `AddResourceModal.jsx`, `VideoUpload.jsx`
- **Status:** ✅ Working — submission, comments, resources
- **Quirk:** `videos.py:143-158` notifies every unique backer when a video is uploaded — can spam if a teacher uploads many videos quickly

### Ratings & Reviews
- **Backend** — `backend/routers/ratings.py`
  - `POST /ratings/project/{id}` (37), `POST /ratings/{id}/respond` (88), `GET /ratings/project/{id}` (120)
- **Frontend** — `RateProject.jsx`, `ProjectDetail.jsx`, `TeacherReviews.jsx`, `components/RespondToReview.jsx`, `components/RateVideo.jsx`
- **Status:** ✅ Working **except**: `TeacherReviews.jsx:23` calls `GET /users/{id}/ratings` which **does not exist** as a route. Either implement it or remove the call.
- **No pagination on GET /ratings/project/{id}** — heavy responses possible

### Tips
- `POST /projects/{id}/tip` (`projects.py:486`) creates a Stripe Checkout for an optional gratuity. Webhook `pledges.py:183-204` credits `project.total_tipped_amount`. 15% Application Fee applied (line 508).

---

## Section 2 — Social & messaging (works)

### Conversations (1:1 between student and teacher)
- **Backend** — `backend/routers/conversations.py` (extensive, 14 endpoints + 2 websockets)
  - Core: `POST /conversations/`, `GET /conversations/`, `GET /conversations/archive`, `GET /conversations/{id}`, `GET /conversations/summary`, `POST /conversations/{id}/messages`
  - Offer flow: `POST /conversations/{id}/offer`, `POST /conversations/messages/{id}/accept-offer` (creates Project + grants achievement), `POST /conversations/messages/{id}/reject-offer` (blacklists teacher)
  - Lifecycle: `POST /conversations/{id}/leave`, `POST /conversations/{id}/teacher-leave`, `POST /conversations/{id}/close`
  - Demo video flow: `POST /conversations/{id}/request-demo-video`, `PATCH /conversations/{id}/demo-video`
  - WebSockets: `WS /conversations/{id}/ws` (per-thread), `WS /conversations/ws` (global)
- **Frontend** — `Inbox.jsx`, `ArchivedConversations.jsx`, `InboxContext.jsx`, `InboxDropdown.jsx`
- **Status:** ✅ Working — full flow with real-time + offer/accept → project creation
- **Heavy use of `User.avatar_url` and `User.full_name`** — load-bearing for messaging UI
- **Cross-tenant — no Tutor scoping.** A student messaging Vasso from `vasso.kotobaseed.net` gets the same inbox as if they messaged from apex. This is probably correct (one identity → one inbox).

### Notifications
- **Backend** — `backend/routers/notifications.py`
  - `GET /notifications/`, `PATCH /notifications/{id}/read`, `PATCH /notifications/read-all`
- **Frontend** — `Notifications.jsx` (polls every 60s)
- **Status:** ✅ Working — poll-based, not push
- **Created by:** achievement unlocks (`gamification.py:42-47`), conversation leave events, new follower events
- **No WebSocket push** — could be added later

### Language Groups + Follow/Unfollow + Achievements
- **Backend:**
  - Groups: `backend/routers/groups.py`
  - Follow: `users.py:300-413`
  - Achievements: `backend/services/gamification.py` — currently only one achievement: `first_steps` (granted on first request acceptance)
- **Frontend:** `Groups.jsx` for groups; follow integrated into `ProjectList.jsx`, `ProjectDetail.jsx`, `ProjectCard.jsx`
- **Status:** ✅ Working — simple, cross-tenant

---

## Section 3 — Profile, settings, auth (mixed)

### Auth — `backend/routers/auth.py`
- ✅ Register (`POST /auth/register` with GDPR + email verification code issued)
- ✅ Login (`POST /auth/token` form, `POST /auth/login` JSON)
- ✅ Email verification (`POST /auth/verify-email`, `POST /auth/resend-verification`)
- ✅ `GET /auth/me`
- **⚠️ Bug — `Register.jsx:25`** navigates to `/login` after registration. But the backend `POST /auth/register` already returns a usable `access_token`. **The frontend discards the token and forces a second login.** Fix: store the token from register and skip the login step (or send the user to a `/verify-email` page).
- **⚠️ Missing — no frontend `/verify-email` page found**, so users registered with email verification have no UI to enter the code they received.

### Apex Profile (`Profile.jsx`)
- **Endpoint:** `GET /users/{id}/profile` (`users.py:241-297`)
- **Edit:** `PATCH /users/me` (`users.py:116-129`)
- **Fields exposed:** `full_name`, `bio`, `languages`, `intro_video_url`, `sample_video_url`, `avatar_url`. Plus follower/following counts, language groups, verified languages.
- **Status:** ✅ Works. Shown for any User (students and teachers).
- **Privacy:** all profiles are public — no opt-out.

### Apex Settings (`Settings.jsx`)
- Edit personal info (full_name, email — although email PATCH is gated)
- **Subscription management** → "Manage Subscription" button calls `/subscriptions/customer-portal`
- **Language verifications submission** → `verifications.py`, gated to `is_pro_subscriber` (legacy CompInput Pro)
- **Stripe Connect onboarding (legacy)** → `POST /users/stripe-onboarding-link` (`users.py:574-600`). **This writes to `User.stripe_account_id`.** ⚠️ Conflicts with new Tutor.stripe_connect_account_id flow.
- **Delete account** → soft-delete via `DELETE /users/me` (`users.py:132-239`). Sets `deleted_at`, anonymizes email, clears bio/languages/videos, reassigns Projects/Pledges/Messages to a `deleted@system` placeholder user.
  - **Bug:** the placeholder email is created with **two different addresses** (`deleted_system_placeholder@example.com` in users.py, `deleted@system` in admin.py:86) — first deletion via one path will collide with the other.
  - Does NOT clear `Tutor.stripe_connect_account_id` if the user has a Tutor row.

### Tutor Profile dashboard (`TutorDashboard.jsx`) — added in Step 8
- **Endpoint:** `GET /tutor/me`, `PATCH /tutor/me` (`tutor_site.py`)
- **Fields:** `display_name`, `bio`, `photo_url`, `languages_taught`, `languages_spoken`, `public_reply_email`
- **Status:** ✅ Works but **edits Tutor row, not User**. This is the core of Sophia's bug report — editing here doesn't affect `User.bio`/`User.avatar_url` shown elsewhere.

### Admin tools — `backend/routers/admin.py`, `Frontend admin/`
- Stats, user list, soft-delete users, project management, verification approve/reject
- **Note:** Verification has **two approve endpoints** — `admin.py:189` and `verifications.py:91` — duplicated.
- **No admin user-role management UI** (can't promote to admin/moderator from the dashboard)
- **No audit log of admin actions**

---

## Section 4 — Tutor sites (Kotobaseed-side, fresh)

### Onboarding (`backend/routers/onboarding.py`, frontend `TutorSignup.jsx`)
- `POST /onboarding/tutor` — atomic User + Stripe Connect Express + Tutor creation (after the recent retry-safe ordering fix)
- `POST /onboarding/tutor/refresh-link` — re-issues Stripe AccountLink
- `GET /onboarding/tutor/status` — self-heals account_status from Stripe (no webhook required)
- **Status:** ✅ Working

### Subdomain rendering (`backend/tenancy.py`, frontend `hooks/useTenant.js`, `App.jsx`)
- Middleware resolves Host → tutor_id; sets `request.state.tutor_id` + `tutor_slug`
- Frontend `useTenant()` reads `window.location.hostname` to switch between `ApexShell` and `TutorShell`
- TutorShell mounts `/` → `TutorHome`, `/dashboard` → `TutorDashboard`
- **Status:** ✅ Working in dev (`*.localhost`) and ready for prod (`*.kotobaseed.net` + wildcard DNS/TLS, not yet deployed)

### Auth handoff apex → subdomain
- localStorage is origin-scoped, so the JWT from apex doesn't carry to subdomains
- Currently: `OnboardingReturn` redirects to `<slug>.<apex>/dashboard#token=...`; `TutorDashboard` reads the fragment, stores token, scrubs URL
- **No way to log into the subdomain directly yet** — `<slug>.kotobaseed.net/login` doesn't exist
- **No way for a returning tutor to jump from apex to their dashboard** other than typing the URL

---

## Section 5 — Monetization (the area Sophia flagged for full reevaluation)

### Current pricing structures, as they exist in code

| Tier | Who pays | Where defined | Status |
|---|---|---|---|
| **Plus** | Students (€?/mo) | `SubscriptionTier.PLUS` (`models.py:18`); env `STRIPE_PLUS_PRICE_ID` | Wired end-to-end to Stripe Checkout + webhook; **price not configured in current `.env`** |
| **Premium** | Students (€?/mo) | `SubscriptionTier.PREMIUM` (`models.py:19`); env `STRIPE_PREMIUM_PRICE_ID` | Wired end-to-end; grants 1× PriorityCredit on each successful payment (`subscriptions.py:179`); **price not configured** |
| **Pro (CompInput student tier)** | Students | `SubscriptionTier.PRO` (`models.py:20`); env `STRIPE_PRO_PRICE_ID` (collides namespace with `STRIPE_PRO_PRICE_ID` for Tutor Pro) | Wired end-to-end; **price not configured**; gates language verification submission via `is_pro_subscriber` |
| **Tutor Starter** | Tutors (€0 + 5% revenue share) | `TutorPlan.STARTER` (`models.py:85`); seeded as default at tutor signup | Starter is the default. **5% Application Fee on tutoring lessons is NOT yet implemented** — lesson booking flow doesn't exist yet |
| **Tutor Pro** | Tutors (€35/mo flat, 0% fee) | `TutorPlan.PRO` (`models.py:86`); env `STRIPE_PRO_PRICE_ID=price_1Teyn2DkbYw1c5w2U6n0fUX8` (Kotobaseed account) | **`PlatformSubscription` model exists (`models.py:822-847`) but no endpoint creates or manages it.** Tutors can't actually upgrade today. |
| **Marketplace pledge fee** | All tutors, all plans | `settings.platform_fee_percent=0.15` (`config.py:48`); also hardcoded `PLATFORM_FEE_PERCENT=0.15` (`projects.py:5`) | 15% Application Fee applied to pledges (`projects.py:715`) and tips (`projects.py:508`) |

### Confusions to resolve

- **Both "Pro" tiers use the same env var name `STRIPE_PRO_PRICE_ID`.** The Kotobaseed Pro tutor product price is in `.env` (`price_1Teyn2DkbYw1c5w2U6n0fUX8`). If the CompInput student Pro tier ever ships, it needs a different env var.
- **`User.is_pro_subscriber` property (`models.py:248-249`) checks `subscription_tier == PRO`** — this is the CompInput student Pro tier, used to gate teacher language verification submission. Confusingly, "Pro" here means something different from "Tutor Pro."

### Priority Credits — half-built
- Model: `PriorityCredit` (`models.py:495-503`) with `status` (AVAILABLE/USED), 30-day expiry
- Grant: only on `invoice.payment_succeeded` for Premium tier (`subscriptions.py:179-182`)
- Use: when creating a request with `use_priority_credit=true` (`requests.py:66-83`)
- Consume: on offer acceptance (`conversations.py:651-669`)
- **Missing:** no UI showing credits available; no monthly grant job (only ad-hoc on each successful payment)

### 14-day rolling reserve (ARCHITECTURE.md §5)
- Described as policy but **NOT configured anywhere in code**. No `stripe.Account.modify(..., settings={"payouts": {"schedule": {"delay_days": 14}}})` call.
- Assumed to be manual Stripe-dashboard configuration per Connect account.

### Open monetization questions for the pricing reevaluation conversation
1. Which (if any) of the CompInput student tiers (Plus/Premium/Pro) should we ship live? Are there active Stripe products?
2. Do we keep them at all, or move all paid features into a unified "Kotobaseed Pro" tier?
3. What's the Tutor Pro upgrade flow? `PlatformSubscription` model is ready but no endpoint creates/manages it.
4. Should the Tutor Pro plan also unlock the legacy "Pro teacher" perks (language verification submission)? Right now they're separate booleans.
5. Should marketplace-only teachers (no Tutor row) be on the same fee structure as Tutor-Starter (15% on pledges) or different?
6. Should we configure the 14-day rolling reserve in code per ARCHITECTURE.md §5, or manage it manually per Connect account?

---

## Section 6 — The data model overlap (Sophia's bug report)

**Sophia's report:** "I changed the bio in the kotobaseed profile and it did not change on the actual site for the individual teacher."

**Root cause:** `User.bio` and `Tutor.bio` are two separate columns. The CompInput Profile.jsx page (apex) edits `User.bio`. The TutorDashboard.jsx page (subdomain) edits `Tutor.bio`. They never sync.

### Field overlap

| Concept | Currently on User | Currently on Tutor | Used where |
|---|---|---|---|
| Bio | `User.bio` (text) | `Tutor.bio` (text) | User.bio: Profile.jsx, UserProfile schema. Tutor.bio: TutorHome.jsx, TutorDashboard.jsx, TutorRead schema. |
| Profile photo | `User.avatar_url` | `Tutor.photo_url` | User.avatar_url: ProjectCard, Inbox, all messaging UI, Profile.jsx, BackerRead. Tutor.photo_url: TutorHome, TutorDashboard. |
| Languages | `User.languages` (text) | `Tutor.languages_taught` + `Tutor.languages_spoken` | User.languages: Profile.jsx, UserProfile schema. Tutor: TutorHome, TutorDashboard, /tutor/me. |
| Intro video | `User.intro_video_url` | `TutorMarketplaceProfile.intro_video_url` (TutorMarketplaceProfile exists in `models.py:617` but no router) | Only Profile.jsx |
| Sample videos | `User.sample_video_url` | `TutorMarketplaceProfile.sample_videos_json` (JSON array) | Only Profile.jsx |

### Stripe account fields — most painful overlap

| Concept | On User | On Tutor |
|---|---|---|
| Connect account id | `User.stripe_account_id` | `Tutor.stripe_connect_account_id` |
| Charges enabled | `User.charges_enabled` | (derived from `Tutor.account_status`) |
| Payouts enabled | `User.payouts_enabled` | (derived from `Tutor.account_status`) |
| Pro subscription | `User.subscription_tier=PRO` + `User.subscription_expires_at` | `Tutor.plan=PRO` (via PlatformSubscription, not yet wired) |
| Customer (for paying tutor subscription) | `User.stripe_customer_id` | `Tutor.stripe_platform_customer_id` |

**Endpoints that write the User-side Stripe fields:**
- `POST /users/stripe-onboarding-link` (`users.py:574-600`) — apex Settings page; creates Stripe Express account, writes `User.stripe_account_id`
- `POST /subscriptions/create-checkout-session` (`subscriptions.py:33-66`) — for student subscription tiers, writes `User.stripe_customer_id`
- `POST /pledges/webhook` `account.updated` handler — writes `User.charges_enabled`, `User.payouts_enabled` AND now `Tutor.account_status`

**Endpoints that write the Tutor-side Stripe fields:**
- `POST /onboarding/tutor` — creates Stripe Connect Express, writes `Tutor.stripe_connect_account_id`
- Same webhook handler above

**Problem:** a Teacher User who signs up via `/onboarding/tutor` gets `Tutor.stripe_connect_account_id` set. But if they then click "Connect your Stripe account" on `Settings.jsx` (apex), it tries to create a SECOND Stripe Express account and writes `User.stripe_account_id`. They end up with two.

### Recommendation (laid out, not yet executed — pending Sophia's direction)

Single identity source on **User** (Sophia confirmed this direction):
- `User.bio`, `User.avatar_url`, `User.languages` → keep as the source of truth
- Both apex Profile.jsx AND TutorDashboard.jsx PATCH `/users/me` for these fields
- Tutor schema's GET `/tutor/me` populates `bio`/`avatar_url`/`languages` from `tutor.user` join, not from Tutor's own columns
- Drop `Tutor.bio`, `Tutor.photo_url`, `Tutor.languages_taught`, `Tutor.languages_spoken` (none of these have production data yet)

Stripe Connect single source on **Tutor** (with legacy User fallback for marketplace-only teachers):
- `Tutor.stripe_connect_account_id` becomes the source for Teachers WITH a Tutor row
- `User.stripe_account_id` stays for marketplace-only teachers (CompInput-style)
- Settings.jsx "Connect Stripe" button should:
  - If user has a Tutor row → redirect to `/onboarding/tutor/refresh-link`
  - Else → use legacy `POST /users/stripe-onboarding-link`
- `pledges.py:handle_account_updated` already handles both — keep that pattern

Display name vs full name:
- `User.full_name` = legal name (for tax/Stripe KYC)
- `Tutor.display_name` = stage name shown on site (can differ from User.full_name)
- Both stay; not overlapping.

Subscriptions:
- Keep `User.subscription_tier` separate from `Tutor.plan` for now — they gate different things
- Reevaluate as part of the pricing conversation

---

## Section 7 — Navigation gaps (Sophia's other report)

> "there is no easy way for a teacher to go between their individual site and their kotobaseed dashboard"

Current state:
- **Apex → tutor's site**: no link anywhere. A logged-in tutor on `kotobaseed.net/teacher/dashboard` has no button that says "Visit my site."
- **Apex → tutor's dashboard**: no link. Only via `/onboarding/return` after Stripe KYC (one-time flow).
- **Tutor site → dashboard**: nothing on `TutorHome.jsx`. The owner gets the same view as a random visitor.
- **Tutor dashboard → tutor site**: ✅ has a "View your site" link in the header (`TutorDashboard.jsx`)
- **Tutor site → apex**: only the small "Powered by Kotobaseed" footer link.

### Recommendation (laid out, pending direction)
1. Add a `Tutor` lookup to `Navbar.jsx` — if the current user has a Tutor row, show "My site" + "My dashboard" buttons in the navbar dropdown
2. Add a "Manage" button on `TutorHome.jsx` visible only to the owner (current user owns this Tutor)
3. Add `<slug>.kotobaseed.net/login` so a returning tutor can log in directly on their subdomain
4. Consider sharing the JWT cross-origin via cookie with `Domain=.kotobaseed.net` for true SSO — bigger lift; defer

---

## Section 8 — Bugs, half-built features, immediate hygiene

### Bugs
1. **Register.jsx discards the JWT** (Section 3) — should keep the token from `/auth/register` instead of bouncing to `/login`
2. **`TeacherReviews.jsx:23` calls `GET /users/{id}/ratings`** which doesn't exist
3. **Two `deleted@system` placeholder emails** in `users.py:137` and `admin.py:86` — first deletion via one path collides with the other
4. **Tip webhook double-count risk** (`pledges.py:191`) — no idempotency check
5. **Verification has two approve endpoints** (`admin.py:189`, `verifications.py:91`)
6. **No `/verify-email` frontend page** — users registered with email verification have no UI to enter the code

### Half-built features
1. **PlatformSubscription model with no endpoint** — can't actually upgrade to Tutor Pro
2. **PriorityCredit grant mechanism** — only on payment-succeeded webhook; no monthly cron; no UI showing current credits
3. **Tutor-side classroom + booking** — referenced in ARCHITECTURE.md but no code yet
4. **TutorMarketplaceProfile model** — exists in `models.py:617` but no router writes/reads it (intro_video / sample_videos for the marketplace half)
5. **Counter-offer / accept-offer / reject-offer endpoints in `requests.py`** — commented out (lines 322-511); flow happens via conversations instead
6. **14-day rolling reserve** — described in ARCHITECTURE.md but not configured in code

---

## Section 9 — Priority queue (for our next discussion)

Roughly in order of "biggest user-visible pain" → "long-term tech debt":

1. **Data model consolidation** (Section 6) — directly causes Sophia's "bio doesn't appear on tutor site" bug. ~1 day of work.
2. **Navigation between apex and tutor sites** (Section 7) — directly causes Sophia's "no easy way" frustration. ~0.5 day.
3. **Register.jsx token handling + `/verify-email` page** — broken signup flow today. ~0.5 day.
4. **Pricing reevaluation conversation** — Sophia explicitly flagged as biggest strategic discussion. Not a coding task; a design conversation that produces a spec.
5. **Tutor subdomain login flow** — `<slug>.kotobaseed.net/login` doesn't exist. ~0.5 day.
6. **Cleanups**: TeacherReviews missing endpoint, deleted@system collision, double approve endpoints, tip idempotency. ~0.5 day total.
7. **PlatformSubscription upgrade flow + Tutor Pro checkout** — gated on the pricing conversation. ~1 day after pricing decided.
8. **Classroom + bookings (tutor sites half)** — separate large effort.
9. **Landing-page builder for tutors** — ARCHITECTURE.md §9. Separate large effort.

---

## Section 10 — Questions for Sophia before any change

These are the questions that, until answered, would force me to guess. I'd rather not guess.

1. **Pricing**: do we ship the CompInput student tiers (Plus/Premium/Pro) at all, or fold them into one Kotobaseed Pro? If we ship them, do you want me to create the Stripe products now and wire env vars?
2. **Stripe Connect for marketplace-only teachers**: keep the legacy `POST /users/stripe-onboarding-link` path indefinitely, or do we want every teacher who reaches a certain marketplace-revenue threshold to be nudged into full Tutor signup?
3. **Display name vs full name**: should `Tutor.display_name` default to `User.full_name` if unset on the tutor site, or stay strictly separate?
4. **Profile privacy**: any reason to keep all profiles fully public, or do we add an opt-out toggle?
5. **Custom domain TLS**: for tutors on Pro with a custom domain, are you OK with Caddy auto-provisioning Let's Encrypt certs per custom domain on-demand (standard for SaaS) or do you want a manual review step?
6. **Reserved subdomains beyond www/api/admin**: should `app`, `account`, `help`, `support`, `blog`, `status` be reserved too?
7. **Anti-abuse dormant pause**: ARCHITECTURE.md mentions "30-day dormant auto-pause" for Starter tutors. Should I wire that as a cron job, or skip for now?
8. **Audit log on admin actions**: do you want one (table + middleware) or skip until needed?
9. **Conversations cross-tenant**: a student-on-vasso messaging Vasso → same inbox as if from apex. Correct, or do you want separate inboxes per tenant?
