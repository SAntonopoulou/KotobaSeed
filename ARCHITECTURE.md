# Kotobaseed — Architecture & Build Plan

A working reference for the Kotobaseed platform. This document captures the
product shape, the business model, the technical architecture, and the
phased rollout. Update it as decisions evolve — it's a living doc, not a spec
to satisfy.

---

## 1. What we're building

**Kotobaseed** is a two-service platform for independent language tutors:

1. **Instructor sites** — a multi-tenant SaaS where each tutor gets their own
   branded site (subdomain or custom domain) for their 1:1 tutoring business.
   Built from the Greek-with-Vasso codebase, generalized for any language
   tutor.

2. **Marketplace** — a shared, public marketplace where tutors publish
   comprehensible-input video projects, students browse / request / fund
   them, and the platform takes a flat percentage of pledges. Built from
   CompInput (this repo), refactored as we touch each piece.

The two services share an identity layer: one Kotobaseed account works
across both. A tutor can use the instructor site only, the marketplace
only, or both. A student of one tutor isn't automatically a student of
another — student accounts are scoped to the tutor whose site they signed
up through, except in the marketplace context where they browse across
all tutors.

### The pitch

Most language-tutor platforms (Preply, italki) take 15–33% of every lesson
plus subscription fees. New tutors lose money before they make money.
Kotobaseed flips that:

- Tutors keep 100% of their tutoring income (Pro plan, flat €35/month) OR
  pay 5% of revenue with no monthly fee (Starter plan, lower-risk for new
  tutors).
- The marketplace creates an additional income stream — a place for
  Kotobaseed tutors to monetize content production, not just live lessons.
- Their site is their brand, their domain, their email — the platform stays
  out of the way.

---

## 2. Pricing model

### Instructor site plans

| | Starter | Pro |
|---|---|---|
| Monthly fee | €0 | €35 |
| Cut of tutoring income | 5% (Stripe Application Fee) | 0% |
| Classroom minutes/month | 300 | 1000 |
| Custom domain | Subdomain only | Yes |
| Marketplace access | Yes (separate fees) | Yes (separate fees) |
| Anti-abuse | Auto-pause after 30d dormant | — |

Both plans require:
- Stripe Connect Express onboarding (KYC, ID, bank) before any teaching.
- A separate card on file for platform charges (overages, plan switches).

### Plan switching

- **Starter → Pro**: allowed any time. Subscription starts immediately,
  next month's lessons are 0%.
- **Pro → Starter**: NOT allowed within the first 12 months. After that,
  one-way switch from Pro to Starter is allowed but flagged for review
  (rare case — usually means the tutor's revenue dropped). This prevents
  the abuse pattern of "Pro in busy months, Starter in slow months."

### Classroom minute overages

Each tutor chooses per-account:

- **Hard block** — classroom session refuses to start once over quota.
  Student sees a "this tutor's quota is exhausted, try again next month"
  message. Tutor sees a banner with an "upgrade or top up" CTA.
- **Auto-bill** — overage minutes charged at €0.015/min to the card on
  file (our cost ~€0.0075/min, 100% margin).

Default at signup: hard block. Tutor opts into auto-bill consciously.

### Refund policy

- **Tutoring lessons**: 14-day refund window from payment. Stripe holds the
  Application Fee in the Connect rolling reserve for 14 days, so refunds
  during this window automatically reverse our 5% (Starter) without us
  having to chase the tutor's bank account.
- **Marketplace pledges**: tied to project lifecycle (existing CompInput
  model) — funds release when the student confirms project completion.
  No general refund window; disputes handled case-by-case.

### Marketplace fee

15% Application Fee on all pledges and tips. Applies regardless of which
tutoring plan the tutor is on. Refunds reverse the fee automatically (same
Stripe Connect behavior as tutoring).

---

## 3. Domain layout

| Surface | URL | Purpose |
|---|---|---|
| Parent brand site | `kotobaseed.net` | Marketing, signup for tutors, login, billing portal |
| Marketplace | `kotobaseed.net/library` | Browse + fund video projects across all tutors |
| Article repo | `kotobaseed.net/articles` | Cross-tutor article library for SEO + discovery |
| Tutor site (subdomain) | `{tutor-slug}.kotobaseed.net` | Each tutor's branded tutoring site |
| Tutor site (custom) | `theirdomain.com` | Optional — Pro plan only |
| Admin (you) | `kotobaseed.net/admin` | Platform oversight |

The marketplace and article repo live at paths on `kotobaseed.net` rather
than subdomains, to concentrate SEO authority on the parent domain. Tutor
subdomains inherit some of that authority via internal linking but
maintain brand separation.

### Custom domain setup (Pro)

- Tutor enters their domain in their admin
- We display DNS instructions: CNAME to `{tutor-slug}.kotobaseed.net`
- Caddy on the server uses on-demand TLS to provision a Let's Encrypt cert
- Tenant resolution checks both the subdomain AND the custom-domain mapping
  table to route requests to the right tutor

---

## 4. Identity & shared accounts

One account, multiple roles. A user signs up at kotobaseed.net (or at any
tutor's site) and gets a `users` record. They can be:

- `student` — books lessons with tutors, takes homework, funds projects
- `tutor` — runs an instructor site, optionally posts to marketplace
- `admin` — platform-wide admin (you)

A user can hold both roles (a tutor can also be a student of another
tutor). The application context determines which role is active.

### Student account scoping

By default, a student account is **per-tutor**. When a student signs up
through `vasso.kotobaseed.net`, their account is associated with Vasso's
tenant — they see Vasso's lessons, bookings, homework. They can't see
another tutor's tutoring content with the same account.

The marketplace is the exception. Marketplace projects, pledges, and
following are at the platform level — a student can fund Vasso's CI
videos and Maria's CI videos from one student profile in the
`kotobaseed.net/library` context.

Practically: students get a "platform" user record + per-tutor "enrollment"
records. The active enrollment determines what they see when on a tutor's
subdomain.

### Tutor account scoping

A tutor account is **single-tenant** — one tutor account owns one
instructor site. To run two sites a person needs two accounts.

---

## 5. Stripe Connect setup

Each tutor has a Stripe Connect Express account, owned by them, provisioned
through Kotobaseed's onboarding flow. All tutor revenue flows through this
account.

### Application Fees

- **Starter tutoring payment**: 5% Application Fee on the payment intent.
  Stripe routes 95% to the tutor's Connect account, 5% to your platform.
- **Pro tutoring payment**: 0% Application Fee. 100% to the tutor.
- **Marketplace pledge**: 15% Application Fee.
- **Marketplace tip**: 15% Application Fee.

### Pro monthly fee

Separate subscription on the **platform's** Stripe account, charging the
tutor's saved card €35/month. Independent of the Connect account.

### Refunds + the reserve

For tutoring with Application Fees (Starter, marketplace):

- Configure a 14-day rolling reserve on the Connect account
- Refunds inside 14 days reverse the Application Fee automatically
- After 14 days, the payout releases; refunds after that would need to
  claw back from the tutor's bank (don't do this — keep the 14-day window
  firm)

### Webhook routing

Existing pattern from Vasso's stripe.py — single webhook endpoint, route
on event type + metadata. Add `instructor_id` to metadata on every
checkout session so we know which tenant the event belongs to.

---

## 6. Data model

Database: PostgreSQL. Schema layered into:

### Shared identity (no tenant scoping)

```
users
  - id, email, hashed_password, role (student/tutor/admin)
  - full_name, timezone, email_verified_at
  - created_at, updated_at

tutors
  - id, user_id, tutor_slug (unique, used in subdomain)
  - display_name, bio, photo_url
  - languages_taught (jsonb), languages_spoken (jsonb)
  - cefr_level_offered (lowest/highest)
  - public_reply_email (used in Reply-To header on transactional sends)
  - plan (starter/pro), plan_started_at
  - classroom_minutes_quota, classroom_minutes_used_this_cycle
  - last_completed_lesson_at (for 30-day Starter deactivation check)
  - is_paused, paused_reason (nullable)
  - stripe_connect_account_id, stripe_platform_customer_id
  - custom_domain (nullable)
  - overage_policy (block/auto_bill)
  - created_at, updated_at

tutor_verifications
  - id, tutor_id, kind (language_proficiency / teaching_credential / identity)
  - description (e.g. "DELE C2", "CELTA from Cambridge", "Native Greek speaker")
  - evidence_file_path (uploaded scan, nullable for self-attested types)
  - status (pending / approved / rejected)
  - reviewed_by_user_id (admin who approved), reviewed_at, review_notes
  - created_at, updated_at

tutor_marketplace_profiles
  - tutor_id, marketplace_enabled
  - intro_video_url, sample_videos (jsonb)
  - follower_count
  - created_at, updated_at

student_enrollments
  - student_user_id, tutor_id
  - status (active/inactive)
  - first_enrolled_at
  - (composite primary key: student + tutor)
```

### Per-tutor (tenant-scoped)

Every table from Vasso's codebase grows a `tutor_id` foreign key. The
tenant middleware sets the active tutor from the subdomain, and all
queries scope by it.

```
bookings (tutor_id, student_user_id, ...)
availabilities (tutor_id, ...)
subscription_plans (tutor_id, ...)
user_subscriptions (tutor_id, student_user_id, ...)
lesson_packs (tutor_id, ...)
user_pack_credits (tutor_id, student_user_id, ...)
homework_packs (tutor_id, ...)
user_homework_credits (tutor_id, student_user_id, ...)
coupons (tutor_id, ...)
static_lessons (tutor_id, ...)
articles (tutor_id, ..., featured_in_global_library boolean)
homework_templates (tutor_id, ...)
assignments (tutor_id, ...)
homework_submissions (tutor_id, ...)
testimonials (tutor_id, ...)
email_templates (tutor_id, ...)
site_settings (tutor_id, ... — was singleton, now per-tutor)
```

### Per-tutor site customization

```
tutor_branding
  - tutor_id
  - theme_id (foreign key to themes table — picks color palette + typography)
  - primary_color, accent_color (from theme's palette)
  - logo_url, favicon_url
  - cefr_glyphs (jsonb — e.g. {"a1": "α", "a2": "β", ...})

tutor_page_sections
  - id, tutor_id, section_type (hero/features/levels/pricing/about/reviews/faq/contact/...)
  - position (integer for ordering)
  - is_visible (boolean)
  - content (jsonb — section-specific shape)
  - created_at, updated_at
```

Page rendering reads tutor_page_sections ordered by position, filters
to visible, and renders each section component with its content payload.

### Marketplace (no tenant scoping — shared)

Ported from CompInput, refactored as we go:

```
projects
  - id, tutor_id (which tutor owns it), title, description, language
  - is_series, video_count_target, price_per_video, total_goal
  - hero_image_url, intro_video_url
  - status (open/funding/in_production/completed/cancelled)
  - funded_amount, completed_at
  - created_at, updated_at

videos (project_id, ...)
project_supplements (project_id, kind, url/path, ...)
pledges (project_id, student_user_id, amount, stripe_session_id, ...)
tips (tutor_id, student_user_id, amount, stripe_session_id, ...)
project_updates (project_id, author_user_id, body, posted_at)
ratings (project_id, student_user_id, stars, review_text, ...)
content_requests (student_user_id, language, level, description, ...)
conversations (content_request_id, tutor_id, student_user_id, status, ...)
messages (conversation_id, author_user_id, body, replied_to_id, ...)
offers (conversation_id, ... — same fields as projects, accepted/rejected)
follows (student_user_id, tutor_id, started_at)
language_groups (id, language_code, name)
language_group_members (group_id, user_id, joined_at)
notifications (user_id, kind, payload jsonb, read_at, ...)
```

### Platform-level (no tenant)

```
themes
  - id, name, primary_palette (jsonb), typography_pair (jsonb)
  - css_class_prefix (which design system kit to load)

tutor_minute_usage_log
  - tutor_id, period_start, daily_minutes_used
  - (running ledger for monthly billing + overage detection)

platform_subscriptions
  - tutor_id, stripe_subscription_id, plan (pro)
  - current_period_start, current_period_end, status

audit_log_entries (already in Vasso's schema — same shape)
```

---

## 7. Tenant resolution

A request comes in. Middleware figures out which tutor (if any) it belongs
to:

1. Read the `Host` header
2. If it matches `kotobaseed.net` → no tutor context (platform routes)
3. If it matches `{slug}.kotobaseed.net` → look up tutor by slug
4. If it matches a custom domain → look up tutor by `custom_domain` field
5. Attach `tutor_id` to the request state
6. All DB queries that touch tenant-scoped tables filter by it

If a request for a tenant-scoped route arrives without a tutor context,
reject with 404. This prevents bugs where someone hits `kotobaseed.net/dashboard`
expecting student data — they'd need to be at their tutor's subdomain.

### Backend (FastAPI)

A dependency `get_current_tutor` that reads `request.state.tutor_id` and
returns the Tutor model. Every router that handles per-tutor data takes it
as a parameter:

```python
@router.get("/bookings/me")
def my_bookings(
    current_user: CurrentUser,
    tutor: CurrentTutor,
    session: Session = Depends(get_session),
):
    return session.exec(
        select(Booking)
        .where(Booking.tutor_id == tutor.id)
        .where(Booking.student_user_id == current_user.id)
    ).all()
```

### Frontend (React)

Subdomain detected at boot. A `TenantContext` provider holds the current
tutor's data (branding, custom CSS variables, section config). Components
consume it via `useTenant()`.

For the marketing/marketplace context (no tenant), `useTenant()` returns
`null` and components fall back to the platform brand.

---

## 8. Articles dual-feed

Articles are written once, displayed in two places.

### Schema

```
articles
  - id, tutor_id, slug (unique per tutor)
  - global_slug (unique across platform — derived from tutor-slug + article-slug)
  - title, summary, body_markdown, lexical_json
  - cefr_level (nullable), language
  - hero_image_url
  - is_published, is_featured_in_global_library
  - published_at, created_at, updated_at
```

### Surfaces

1. **Tutor's own site**: `{tutor}.kotobaseed.net/articles` lists their
   articles. `{tutor}.kotobaseed.net/articles/{slug}` reads with tutor branding.
   This is the primary surface — Google indexes these as the tutor's content.

2. **Platform library**: `kotobaseed.net/articles` lists ALL articles where
   `is_featured_in_global_library = true` across all tutors. Browse / filter
   by language, level, tutor. Article reader at
   `kotobaseed.net/articles/{global-slug}` renders the same content with
   kotobaseed branding + a "Learn with {tutor}" CTA linking to the tutor's
   site.

The tutor decides per-article whether it gets featured in the global
library. Default: yes (most tutors want the discovery).

### SEO

- `kotobaseed.net/articles/...` uses `<link rel="canonical">` pointing to
  the article's tutor-subdomain URL. This tells Google "the real version is
  on the tutor's site." Counter-intuitively, this concentrates SEO juice on
  the tutor's domain rather than kotobaseed's, but it avoids duplicate-
  content penalties.
- Both surfaces render full meta tags (title, description, OG image,
  JSON-LD Article schema) via `react-helmet-async`.
- Both surfaces are indexed via sitemap.xml — generated from the articles
  table, includes both URLs.
- RSS feed at `kotobaseed.net/articles/feed.xml` and
  `{tutor}.kotobaseed.net/articles/feed.xml`.

---

## 9. Landing-page builder ("within reason")

Each tutor's homepage is rendered from a stack of sections they pick and
order in their admin.

### Section types (V1 library)

| Type | Purpose | Editable fields |
|---|---|---|
| `hero_portrait` | Portrait + headline + CTA | photo, headline, sub, CTA labels + targets |
| `features_grid` | "How it works" 3-card row | 3× {icon, title, body} |
| `levels_alphabet` | α/β/γ-style level cards | glyphs (per language), labels, copy |
| `pricing_grid` | Plans + Taster | (auto-pulled from subscription_plans + site_settings) |
| `about_portrait` | Bio + portrait + quote | photo, paragraphs, attribution |
| `reviews_grid` | Testimonials | (auto-pulled from testimonials table) |
| `faq_accordion` | Collapsible Q&A | list of {question, answer} |
| `video_embed` | Single embedded video | YouTube/Vimeo URL + caption |
| `cta_band` | Single full-width CTA | headline, sub, button label, button target |
| `language_intro` | "What is {language}?" content | image, paragraphs |

More section types added as common requests emerge.

### Admin UI

`/{tutor}/admin/landing` shows the section list in order, with:
- Drag-to-reorder
- Toggle visibility per section
- Edit fields inline (form per section type)
- "Add section" button → picks from library
- Live preview pane on the right (renders the current configuration)
- Theme picker at the top (selects color palette + typography)
- Per-section delete (with confirm)

### Rendering

The public homepage component:
1. Fetches `tutor_page_sections` ordered by position
2. For each visible section, looks up its component by type
3. Passes the content jsonb to the component
4. Component renders using the tutor's theme tokens

Every section component is built once, responsive, accessible, mobile-ready.
Tutors can't break the layout because they can't change CSS — they only
edit content.

### Theme system

A small library of themes (3 at launch):
- `warm-aegean` — Vasso's current style (sand background, brand blue, honey accents)
- `clean-modern` — white background, monochrome with one accent
- `bold-asian` — strong typography, larger ratios, for languages where
  glyphs matter most

Each theme is a coordinated set of CSS custom properties + typography
choices, loaded based on the tutor's `tutor_branding.theme_id`.

---

## 10. Classroom minutes tracking

Daily.co provides per-room duration via their webhook. Each booking creates
a Daily room with metadata pointing to the booking_id and tutor_id.

### Flow

1. Lesson starts in a Daily room → `room.started` webhook fires
2. Lesson ends → `room.ended` webhook fires with `duration_seconds`
3. We log to `tutor_minute_usage_log` with date + minutes
4. Aggregate by month to get `classroom_minutes_used_this_cycle` on the
   tutor record

### Cycle reset

Monthly cron job at the start of each month:
1. Aggregate previous month's `tutor_minute_usage_log` rows per tutor
2. If tutor exceeded quota AND chose auto-bill → charge their card for
   overage minutes × €0.015
3. Reset `classroom_minutes_used_this_cycle` to 0
4. Archive the log

### Quota enforcement

Before each booking confirms → check if tutor has minutes remaining (using
the duration the booking requires). If not AND overage policy is `block` →
reject the booking. If overage policy is `auto_bill` → proceed and charge
later.

---

## 11. Repo / module structure

Monorepo with two main apps + shared libraries:

```
kotobaseed/
├── ARCHITECTURE.md       (this file)
├── README.md
├── docker-compose.yml
├── Caddyfile             (wildcard cert + custom domain routing)
├── packages/
│   ├── shared/           (shared TypeScript types, design tokens)
│   └── design-system/    (kit CSS files used by both frontends)
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── tenancy.py    (subdomain resolution, current_tutor dep)
│   │   ├── models.py     (all SQLModel models)
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── platform/         (kotobaseed.net routes)
│   │   │   │   ├── signup.py
│   │   │   │   ├── billing.py
│   │   │   │   └── admin.py
│   │   │   ├── tutor_site/       (tenant-scoped routes)
│   │   │   │   ├── bookings.py
│   │   │   │   ├── availability.py
│   │   │   │   ├── subscriptions.py
│   │   │   │   ├── lesson_packs.py
│   │   │   │   ├── homework_packs.py
│   │   │   │   ├── homework.py
│   │   │   │   ├── articles.py
│   │   │   │   ├── testimonials.py
│   │   │   │   ├── email_templates.py
│   │   │   │   ├── settings.py
│   │   │   │   ├── audit_log.py
│   │   │   │   ├── credits.py
│   │   │   │   ├── students.py
│   │   │   │   └── landing.py    (page section CRUD)
│   │   │   ├── marketplace/      (cross-tenant routes)
│   │   │   │   ├── projects.py
│   │   │   │   ├── pledges.py
│   │   │   │   ├── requests.py
│   │   │   │   ├── conversations.py  (WebSocket)
│   │   │   │   ├── follows.py
│   │   │   │   ├── groups.py
│   │   │   │   └── ratings.py
│   │   │   ├── articles_library.py   (cross-tutor global article surface)
│   │   │   └── stripe.py             (single webhook router, routes on metadata)
│   │   ├── services/
│   │   │   ├── email.py
│   │   │   ├── stripe_service.py
│   │   │   ├── daily.py              (classroom minute tracking)
│   │   │   ├── audit.py
│   │   │   └── homework_grading.py
│   │   └── migrations/  (Alembic)
│   └── tests/
├── frontend/             (single SPA, branches per-tenant via TenantContext)
│   └── src/
│       ├── api/
│       ├── auth/
│       ├── tenant/       (TenantContext + subdomain detection)
│       ├── components/
│       ├── pages/
│       │   ├── platform/     (kotobaseed.net pages)
│       │   ├── tutor_site/   (each tutor's site)
│       │   ├── marketplace/  (library + project pages)
│       │   └── shared/       (login, signup, account)
│       └── styles/kits/      (the CSS kits — marketing, booking, lesson-player, admin)
└── infra/
    ├── deploy.sh
    └── stripe/setup.sh     (Connect product/webhook bootstrap)
```

One frontend bundle serves all surfaces. The router checks the URL + tenant
context to decide which app shell to render. This is simpler than separate
SPAs but means the bundle grows. We can split later if it gets unwieldy.

---

## 12. Phased rollout

Each phase ends with a working deployable state. Don't ship Phase N until
Phase N-1 is solid.

### Phase 0 — Repo + audit (next session)

- Rename CompInput repo to `kotobaseed` on GitHub
- Update local clone's remote
- Code-quality audit of every router and page — produce a per-file checklist
  of "keep as-is", "refactor as we touch", "replace entirely"
- Set up Alembic migrations infrastructure (CompInput doesn't have any)
- Add a basic test suite skeleton

### Phase 1 — Foundation

- Multi-tenant schema migration: add `tutor_id` to every existing table,
  create the `tutors`, `tutor_branding`, `tutor_page_sections`,
  `tutor_minute_usage_log`, `platform_subscriptions` tables
- Tenant resolution middleware (subdomain → tutor)
- Tenant context provider in frontend
- `kotobaseed.net` marketing site (parent brand) — small marketing page,
  signup CTA, "browse marketplace" CTA, "find a tutor" coming-soon CTA
- Tutor signup flow at `kotobaseed.net/become-a-tutor`
- Stripe Connect Express onboarding for tutors
- Platform subscription billing for Pro plan
- A "hello world" tutor site at `firsttutor.kotobaseed.net` — login,
  account, sign out. Nothing else yet.

### Phase 2 — Tutoring parity

Port Vasso's tutoring features into the tenant-scoped routers, one at a
time. After each: a running tutor site with that feature.

- Bookings + availability + virtual classroom
- Subscription plans + user_subscriptions
- Lesson packs + homework packs (separate currencies)
- Coupons
- Self-paced lessons (CMS)
- Homework templates + assignments + auto-grading
- Email templates (per-tenant override of platform defaults)
- Testimonials
- Site settings (per-tutor)
- Audit log (per-tutor + platform-level)
- Customer-facing dashboard for students
- Transactional emails with per-tutor display name + Reply-To routing
  (single platform Resend domain; tutor sets their public reply address)

At the end of Phase 2: a new tutor can sign up, set their availability,
configure pricing, take bookings, run lessons, assign homework. They have
parity with Vasso's site, just multi-tenant.

### Phase 3 — Landing page builder

- Section component library (V1: hero_portrait, features_grid, levels_alphabet,
  pricing_grid, about_portrait, reviews_grid, faq_accordion, video_embed,
  cta_band, language_intro)
- `tutor_page_sections` CRUD API
- Admin UI: drag-to-reorder, edit per section, theme picker, live preview
- Public homepage renders from the configured sections
- 3 starting themes (warm-aegean, clean-modern, bold-asian)

### Phase 4 — Marketplace (the differentiator)

Port CompInput's marketplace features into `marketplace/` routes, refactor
as we go.

- `tutor_marketplace_profiles` opt-in
- Projects (single + series), videos, supplements
- Pledges via Stripe Connect with 15% Application Fee
- Tips
- Content requests + conversations (WebSocket chat)
- Offers in chat
- Follow + language groups
- Notifications
- Ratings + reviews
- Marketplace UI at `kotobaseed.net/library`
- Cross-tutor discovery

At the end of Phase 4: marketplace fully functional. Tutors can publish
projects, students can fund them, tutors get paid via Connect.

### Phase 5 — Articles dual-feed + SEO

- Articles per tutor (already in tutor_site router)
- `is_featured_in_global_library` flag
- Public library at `kotobaseed.net/articles`
- Canonical URLs pointing to tutor subdomains
- Sitemap.xml generation
- RSS feeds (per tutor + global)
- JSON-LD on article pages
- `react-helmet-async` for per-page meta tags

### Phase 6 — Custom domains + polish

- Custom domain CNAME instructions in tutor admin
- Caddy on-demand TLS for tutor custom domains
- Multi-tutor invoicing for monthly bills
- Per-tutor analytics (lessons booked, revenue, marketplace earnings,
  article views)
- Refer-a-tutor program
- Open question: a tutor marketplace? (browse all tutors on the platform
  from `kotobaseed.net/tutors`)

### Phase 7 — Community + growth (future)

- Tutor-to-tutor features (collaboration, co-taught projects)
- Cross-tutor student paths (a student of Vasso for Greek + Maria for
  Japanese, one shared dashboard)
- Anti-abuse refinements (heuristics, manual review queue)
- Internationalization of the platform's own UI

---

## 13. File-by-file porting plan

Reference for Phase 1+2+4 work. Each row maps an existing file to its
Kotobaseed destination, with the changes required.

### Backend — Vasso's code → Kotobaseed tutor_site

| Vasso file | Kotobaseed destination | Key changes |
|---|---|---|
| `app/routers/auth.py` | `app/routers/auth.py` | Move to platform-level (no tenant scoping for auth) |
| `app/routers/scheduling.py` | `app/routers/tutor_site/bookings.py` | Add tutor_id scoping to every query |
| `app/routers/availability.py` | `app/routers/tutor_site/availability.py` | Same |
| `app/routers/subscriptions.py` | `app/routers/tutor_site/subscriptions.py` | Same; Stripe Connect Application Fee logic |
| `app/routers/lesson_packs.py` | `app/routers/tutor_site/lesson_packs.py` | Same |
| `app/routers/homework_packs.py` | `app/routers/tutor_site/homework_packs.py` | Same |
| `app/routers/coupons.py` | `app/routers/tutor_site/coupons.py` | Same |
| `app/routers/cms.py` | `app/routers/tutor_site/lessons.py` + `articles.py` | Split; articles support `is_featured_in_global_library` |
| `app/routers/learning.py` | `app/routers/tutor_site/homework.py` | Same |
| `app/routers/email_templates.py` | `app/routers/tutor_site/email_templates.py` | Per-tutor defaults override platform defaults |
| `app/routers/settings.py` | `app/routers/tutor_site/settings.py` | Per-tutor; single-lesson Stripe Product per tutor |
| `app/routers/testimonials.py` | `app/routers/tutor_site/testimonials.py` | Same |
| `app/routers/admin_credits.py` | `app/routers/tutor_site/credits.py` | Same |
| `app/routers/audit_log.py` | `app/routers/tutor_site/audit_log.py` + `app/routers/platform/admin.py` | Per-tutor + platform-wide |
| `app/routers/students.py` | `app/routers/tutor_site/students.py` + `app/routers/shared/account.py` | Per-tutor student data + cross-tenant account self-serve |
| `app/routers/onboarding.py` | `app/routers/shared/onboarding.py` | Per-tutor: free-trial, paid-lesson |
| `app/routers/stripe.py` | `app/routers/stripe.py` | Single webhook, route on metadata.kind + metadata.tutor_id |
| `app/routers/classroom.py` | `app/routers/tutor_site/classroom.py` | Daily room creation with tutor_id metadata for minute tracking |

### Backend — CompInput → Kotobaseed marketplace

| CompInput file | Kotobaseed destination | Notes |
|---|---|---|
| `backend/routers/projects.py` (661 lines) | `app/routers/marketplace/projects.py` | Refactor: shorter helpers, type hints, better error handling |
| `backend/routers/conversations.py` (1052 lines) | `app/routers/marketplace/conversations.py` | WebSocket logic — keep mostly intact; refactor message handlers |
| `backend/routers/requests.py` | `app/routers/marketplace/requests.py` | Clean port |
| `backend/routers/pledges.py` | `app/routers/marketplace/pledges.py` | Connect with 15% Application Fee |
| `backend/routers/videos.py` | `app/routers/marketplace/videos.py` | File storage with tutor_id prefix |
| `backend/routers/ratings.py` | `app/routers/marketplace/ratings.py` | Clean port |
| `backend/routers/groups.py` | `app/routers/marketplace/groups.py` | Clean port |
| `backend/routers/notifications.py` | `app/routers/marketplace/notifications.py` | Extend to support tutoring events too |
| `backend/routers/verifications.py` | `app/routers/marketplace/verifications.py` | Tutor verification (language credentials, etc.) |
| `backend/routers/admin.py` | `app/routers/platform/admin.py` | Platform-admin only |
| `backend/routers/users.py` | merged into shared/account + tutor_site/students | Identity + per-tenant student data split |
| `backend/services/gamification.py` | `app/services/gamification.py` | Carry over |

### Frontend — to convert JSX → TSX

All `frontend/src/pages/*.jsx` → `pages/*.tsx`. Vite handles mixed builds,
so convert gradually. Add types as we touch each file. Re-skin with our
existing kit classes (the design system Vasso uses) rather than CompInput's
Tailwind setup — pick one. Recommended: use our kit classes for the new
shared pages, keep CompInput's Tailwind for marketplace pages that we're
just porting (less rework).

---

## 14. Decisions

### Resolved

1. **Email From-address for tutoring** — RESOLVED. Use a single platform
   Resend domain (`send.kotobaseed.net` or similar) with a per-tutor
   display name carrying the tutor's identity. Concretely:

   ```
   From: "Vasso · Greek with Vasso" <noreply@send.kotobaseed.net>
   Reply-To: vasso-actual-email@gmail.com
   ```

   Students see the tutor's name in their inbox; replies route to the
   tutor's real email. No per-tutor DNS setup, no domain verification
   work, no Resend per-domain cost. Each tutor sets a "public reply
   address" in their settings, and the email service injects it into
   the `Reply-To` header. Newsletter sends remain platform-from too
   (transactional and bulk both go through this).

   If a tutor on Pro later wants a fully custom domain
   (`noreply@vasso.com`), that's a Phase 6+ feature — verify the domain
   through Resend, store the verified domain on the tutor record,
   switch the From for that tutor's sends.

2. **Anti-abuse for Starter** — RESOLVED. No manual review. The
   protective measures are:

   - Stripe Connect Express onboarding (KYC, ID, bank) required before
     any teaching → blocks the easy multi-account abuse path
   - Card on file required for platform charges
   - **Auto-deactivate Starter accounts** after 30 days with zero
     completed lessons. Tutor sees a "your account is paused, take a
     lesson to reactivate" banner; no classroom access until they do.
   - **Auto-deactivate Pro accounts** after 60 days of failed/missing
     subscription payments. (Already standard via Stripe's
     `subscription.deleted` webhook.)
   - Rate-limit on new account creation per IP (basic anti-bot)

   If abuse patterns emerge, we add manual review later. Don't pre-build
   for problems we haven't seen.

3. **Tutor verification depth** — RESOLVED. Verification applies to
   tutoring too. It's optional — tutors can teach without it — but a
   green "Verified" badge appears on their tutor site and marketplace
   profile when they hold credentials.

   Verification types supported:
   - **Language proficiency** — they're a native speaker of the language
     they teach (self-attested + verified by you or via a credential)
   - **Teaching credential** — CELTA, DELTA, DELE, JLPT N1, university
     degree in language education, etc. — they upload a scan, admin
     reviews + approves
   - **Identity** — already verified by Stripe Connect KYC at signup;
     we just surface "Stripe-verified identity" as a baseline badge

   Verification UI lives in tutor admin under "Profile → Credentials."
   Admin (you) sees a queue of pending verification requests in the
   platform admin and approves/rejects with notes. CompInput already has
   most of this flow at `routers/verifications.py` — port it.

4. **Article library access** — RESOLVED. Articles are always free
   reading; the SEO + discovery play depends on it. The marketplace
   handles paywalled content via video projects with pledges.

5. **Multi-language platform UI** — RESOLVED. English-only at launch.
   Localize when tutors in non-English-speaking regions ask for it.

6. **Stripe Connect onboarding type** — RESOLVED. Launch with Express
   only. Standard linking (for tutors who already have their own Stripe
   account) is a Phase 6+ feature.

### Still open

7. **Browse-tutors surface on kotobaseed.net**: at launch, students find
   tutors via the marketplace (projects + content requests) or via direct
   referral from a tutor's existing audience. A "browse tutors" listing
   at `kotobaseed.net/tutors` could be added in Phase 6 if we see
   instructors asking for cross-tutor discovery.

8. **Per-tutor refund window override**: 14-day refund window is the
   platform default. Should tutors be able to set their own
   (shorter/longer)? Recommend: no — keep it uniform for legal and
   accounting clarity. Re-open if a tutor genuinely needs a different
   policy.

9. **Article cross-tutor co-authorship**: if Vasso and Maria want to
   co-author an article, who owns the URL? Recommend: defer until a
   tutor asks; not a launch blocker.

---

## 15. Next session checklist

1. Rename CompInput repo to `kotobaseed` on GitHub
2. Update local clone's remote URL
3. Code-quality audit, file by file:
   - `backend/main.py`
   - `backend/models.py`
   - `backend/routers/auth.py`
   - `backend/routers/projects.py`
   - `backend/routers/conversations.py` (the big one)
   - `backend/routers/pledges.py`
   - `backend/routers/requests.py`
   - `backend/routers/users.py`
4. Add Alembic to CompInput backend
5. Add a basic test fixture (pytest)
6. Decide on email-domain strategy (open decision #1)
7. Then start Phase 1: schema migration + tenant middleware

---

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| Tenant | A tutor's isolated instance — their site, their students, their data |
| Tenant scoping | DB queries that filter by `tutor_id` |
| Connect Application Fee | Stripe mechanism for platform to take a cut of a Connect payment |
| Connect rolling reserve | Holding period before payouts release to tutor's bank |
| Subdomain routing | Determining tenant from `Host` header |
| Custom domain | Tutor's own domain pointing to Kotobaseed (Pro only) |
| Marketplace project | A video-production crowdfunding project (CompInput concept) |
| CI / Comprehensible Input | Krashen's pedagogy — content slightly above learner's level |
| Starter plan | €0/month + 5% revenue share |
| Pro plan | €35/month + 0% revenue share |
| Section | One block of a tutor's landing page (hero, features, etc.) |
| Global article library | `kotobaseed.net/articles` cross-tutor surface |

---

*Last updated: 2026-06-05.*
*Owner: Sophia (with implementation help from Claude).*
