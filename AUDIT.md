# Kotobaseed — Code Audit

A per-file assessment of the existing codebase (formerly CompInput) ahead of
the Kotobaseed refactor. Each file has a verdict — **KEEP**, **REFACTOR**,
**REWRITE**, or **DELETE** — with notes on what specifically needs doing.

Audit covers: backend (5,071 lines Python) + frontend (6,271 lines JSX).
Read the full file index in the architecture doc; this one focuses on
judgment + concrete next actions.

---

## Cross-cutting issues (touch everywhere)

These are global patterns to fix as part of the refactor, not file-specific.

| Issue | Severity | Fix |
|---|---|---|
| `datetime.utcnow()` used everywhere | High (deprecated, will be removed in Py 3.13+) | Replace with `datetime.now(timezone.utc)` site-wide |
| `SECRET_KEY` defaults to literal `"CHANGE_THIS_TO_A_SECURE_SECRET_KEY"` | **Critical security** | Crash on startup if SECRET_KEY env var is missing — never silently fall back |
| `STRIPE_WEBHOOK_SECRET` defaults to `"whsec_placeholder"` | **Critical security** | Same — refuse to start without it set |
| No Alembic — uses `SQLModel.metadata.create_all()` | High (every schema change is manual + risks data loss) | Add Alembic + baseline migration before any model changes |
| No tests at all | High (every refactor is "hope it still works") | Add pytest + fixtures for at least the critical paths (auth, pledges, project lifecycle, webhook handling) |
| Pydantic v1 syntax: `class Config: from_attributes = True`, `.dict()`, `.model_dump_json()` mixed | Medium (works now but Pydantic v3 will break it) | Standardize on v2: `model_config = ConfigDict(from_attributes=True)`, `.model_dump()` |
| `@app.on_event("startup")` deprecated | Low | Replace with FastAPI lifespan context manager |
| CORS allows hardcoded ngrok URLs | Low (cleanup) | Move to env-driven list |
| Stripe API key set with `os.getenv()` at module import time in three routers separately | Medium (works but fragile) | Centralize in a `stripe_client.py` initialized once |
| `print()` mixed with `logger.info()` | Low | Standardize on structured logging |
| Auth uses argon2 (good) and JWT (fine) but no refresh tokens, no email verification, no rate limiting on login | Medium | Replace with Vasso's auth router which has these |
| N+1 queries pervasive (most acutely in `_create_project_read` and `_create_conversation_read`) | High (will get slow at scale) | Batch via JOINs / window functions in the list endpoints |
| SQLite default in `database.py` | Medium for SaaS | Switch default to Postgres (keep SQLite as test fixture) |

---

## Backend

### `backend/main.py` — REWRITE
**73 lines.** Defines the FastAPI app, CORS, startup seed, and includes routers.

What's wrong:
- Deprecated `@app.on_event("startup")` instead of lifespan
- Startup task does TWO unrelated things (create admin + sync language groups) — should be separate idempotent seed scripts
- `from .routers import subscriptions` happens mid-file (line 86) instead of with the other imports
- Hardcoded ngrok URLs in CORS list

Replace with: Vasso's `app/main.py` shape — clean imports, lifespan that just calls `init_db()`, env-driven CORS, then `app.include_router(...)` calls grouped together.

### `backend/database.py` — REFACTOR
**19 lines.** Engine + session factory + create_all.

What to keep: the basic structure.
What to change: drop SQLite default in favor of Postgres for production. Add `pool_pre_ping=True`. Move the `create_db_and_tables` call to be paired with Alembic.

### `backend/deps.py` — KEEP (with small fixes)
**~80 lines.** `get_current_user`, optional variant, admin check, `require_role`.

Clean code. Fix: `HTTPException(status_code=404, ...)` when user from a valid token doesn't exist — should be 401, not 404 (token references a deleted user). Also `get_current_user_optional` swallows JWT errors silently, which is correct here.

### `backend/security.py` — REFACTOR
**39 lines.** Password hashing + JWT.

Argon2 is great. Issues:
- `SECRET_KEY = os.environ.get("SECRET_KEY", "CHANGE_THIS_TO_A_SECURE_SECRET_KEY")` — **fix the fallback before anything else**. Same for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- `datetime.utcnow()` in `create_access_token`
- No refresh token mechanism — fine for now, but mention in the architecture doc

### `backend/config.py` — KEEP
Empty file. Worth keeping as a placeholder; can become a Pydantic Settings module later (`BaseSettings` style) to centralize env reading.

### `backend/models.py` — REFACTOR
**382 lines.** All SQLModel models in one file.

What's good:
- Clean structure
- Foreign keys + indexes in the right places
- Relationship `back_populates` properly wired
- Junction tables for many-to-many (UserLanguageGroup, UserAchievement)
- `is_pro_subscriber` property on User

What needs change:
- `datetime.utcnow()` as default_factory throughout — change to `lambda: datetime.now(timezone.utc)`
- Single-file models — split when adding tenant tables. Suggested split: `models/identity.py`, `models/tutoring.py`, `models/marketplace.py`, `models/platform.py`
- `User.languages` is a `Optional[str]` (comma-separated?) — should be JSONB list. Same with `Project.tags`
- `User` lacks `email_verified_at`, `tenant_id` (well, in our case, user-tenant join via `student_enrollments`), and the verification fields will be added when porting Vasso's email verification
- The `Pledge.checkout_session_id` and `payment_intent_id` indexes are correct (good for webhook lookup)
- `Message` table has nine `offer_*` fields denormalized — should be a separate `Offer` model since they're conceptually distinct. Works for now, but data model is muddy
- Missing `updated_at` on several tables (Conversation has it; Project has it; many others don't)
- No soft-delete on most tables; only User has `deleted_at`

For the multi-tenant migration: add `tutor_id` foreign key everywhere it makes sense (Projects → already has teacher_id which IS the tutor for marketplace; tutoring-side tables we're porting in will all get fresh `tutor_id`).

### `backend/schemas.py` — REFACTOR
**259 lines.** Pydantic schemas for requests/responses.

Pydantic v1 patterns throughout. Many schemas duplicate fields from models (which is fine — different surface area), but the duplication suggests we should generate schemas with `SQLModel`'s `__init_subclass__` or use `model_fields` to keep them in sync.

Action: convert to Pydantic v2 syntax (mostly `class Config:` → `model_config = ConfigDict(...)`). Skip the deeper deduplication for now.

### `backend/routers/auth.py` — REPLACE
**85 lines.** Register + login.

Replace with Vasso's `app/routers/auth.py`:
- Has email verification flow with 6-digit codes (we want this)
- Has login-twice fix in the AuthContext (covered in frontend)
- Has GDPR consent + IP capture at signup
- Has `/me` endpoint (CompInput's `/users/me` is in users.py — should move)

CompInput's auth doesn't have email verification at all. Replacing it is the cleaner path than retrofitting.

### `backend/routers/projects.py` — REFACTOR
**661 lines.** Project lifecycle: create, list (3 surfaces), get, update, complete, confirm, cancel, tip, related, updates.

Solid business logic. Stripe Connect Application Fee is implemented correctly. The cancel flow does real Stripe refunds + reopens the request + blacklists the teacher — good engineering.

Issues:
- `_create_project_read` does up to 5 separate queries per project (pledge lookup, follow lookup, rating lookup, ratings aggregate, verifications) — this gets called inside list iterations → **classic N+1**. Refactor to: one bulk query upfront that returns all the per-project metrics indexed by project_id, then build ProjectRead from that.
- Two list endpoints (`/`, `/archive`) duplicate filter/search logic — extract a `apply_project_filters(query, language, level, search)` helper
- Tip checkout shouldn't live here — split into a `tips.py` router (or extend pledges)
- The `Project.dict()` call on creation is Pydantic v1 — change to `model_dump()`
- The `funding_goal` derivation logic (for series) is convoluted — clearer if extracted

Refactor in place when we touch this for multi-tenancy. Don't rewrite — the business logic is correct.

### `backend/routers/pledges.py` — KEEP (with small fixes)
**289 lines.** Pledge creation via Stripe Checkout + webhook handlers.

This is actually clean. The webhook handler:
- Validates signature properly
- Handles three event types (checkout.session.completed, account.updated, charge.refunded)
- Uses metadata to distinguish tip vs pledge
- Cancels in-flight pending pledges (idempotency check on status)
- Updates project funding atomically
- Auto-transitions FUNDING → SUCCESSFUL when goal reached
- Holds projects when teacher's Stripe account is restricted

Small fixes:
- `datetime.utcnow()` (cross-cutting)
- One handler does `session.rollback()` on error but the others don't — pick one pattern (rolling back is correct; standardize)
- The webhook handlers are defined at module level then dispatched inside `stripe_webhook` — would be cleaner as a dict of event_type → handler

KEEP with minor sweeping.

### `backend/routers/conversations.py` — REFACTOR (the big one)
**1,052 lines.** WebSocket chat + offer-in-chat + offer acceptance creating projects + read receipts.

This is the largest file in the project. It does too much in one module but the core logic is good.

What's good:
- `ConnectionManager` is clean
- The two WebSocket endpoints (per-conversation + global notifications) are correctly authenticated via token query param
- Accept-offer flow creates a Project + closes all related conversations + handles priority credits + awards first-step achievement
- Read receipts broadcast to update unread counts

Issues:
- **`_create_conversation_read` has severe N+1**: for each message in a conversation, it does `session.get(User, msg.sender_id)` and another `session.get(Message, ...)` + `session.get(User, ...)` for the reply chain. A conversation with 50 messages does 150+ queries.
- `_create_conversation_summary_read` does a separate query per conversation for last message + unread count → another N+1 in the list endpoints
- The 700+ lines of route handlers should be split into: `routes.py` (HTTP routes), `websocket.py` (WS endpoints + ConnectionManager), `helpers.py` (the `_create_*` helpers)
- `print()` calls in WebSocket error handlers should be `logger.error()`
- `Message` model has nine `offer_*` columns — when we split this, the Offer concept becomes its own model with a FK from Message

REFACTOR plan when porting:
1. Split into `routers/marketplace/conversations.py` + `routers/marketplace/conversations_ws.py` + `services/conversation_helpers.py`
2. Replace `_create_conversation_read` with a single batched fetch (load all messages + senders + reply chain in one query via JOIN)
3. Replace `_create_conversation_summary_read` with a single batched fetch using aggregates
4. Keep ConnectionManager intact (it works)
5. Keep the offer-acceptance state-machine intact (it's correct and important)

### `backend/routers/requests.py` — REFACTOR
**475 lines.** Content requests (student-posted), counter offers, request lifecycle, priority credits.

Generally clean. Notable patterns:
- Has its own `RequestCreate` shadowing the one in schemas.py with an added `use_priority_credit` field. **Confusing** — fold into the schema or rename.
- Priority credits logic intertwined with request creation
- Some duplicate notification-building code

Refactor opportunistically when we touch it.

### `backend/routers/videos.py` — KEEP (with small fixes)
**262 lines.** Video upload by URL (YouTube/Vimeo platform tag), video CRUD, resources.

Standard CRUD. Fix datetime.utcnow + Pydantic v1 patterns; otherwise leave alone.

Future improvement (Phase 4+): direct video file upload to S3-compatible storage rather than URL-only. CompInput is YouTube/Vimeo-only.

### `backend/routers/ratings.py` — KEEP
**123 lines.** Rate a project (backers only), teacher response to ratings.

Clean. Fix Pydantic v1 + datetime patterns. Otherwise solid.

### `backend/routers/admin.py` — REFACTOR
**207 lines.** Platform admin: stats, list pending verifications, approve/reject verifications, cancel projects, archived projects.

Reasonably clean. Issues:
- Imports `_cancel_project_logic` from projects.py — that's fine, but suggests we extract these into a `services/projects.py`
- Admin stats endpoint doesn't have a time-range filter — for a real platform you'd want last-30-day metrics
- No audit log of admin actions (Vasso has one — we'd add it)

Refactor in place; add audit log calls when porting.

### `backend/routers/subscriptions.py` — REPLACE (eventually)
**222 lines.** Stripe Subscription for "Plus" / "Premium" tiers. Customer Portal endpoint.

This is CompInput's old per-student subscription system (gives priority credits + perks). For Kotobaseed this gets fully reused but for a different model:
- **Pro plan subscription** for tutors (platform charging the tutor)
- **Marketplace student perks** (priority credits — keep if useful)

The Stripe Subscription mechanics are right; the product-level meaning of the tiers changes. Plan: REPLACE the tier definitions + endpoint URLs but KEEP the underlying Stripe Subscription wiring.

Note: imports use `from backend.X` (absolute) while other routers use `from ..X` (relative) — inconsistent. Standardize on relative.

### `backend/routers/verifications.py` — KEEP
**115 lines.** Teacher submits verification with document URL, admin approves/rejects.

Clean. Already does what we want for the verified-badge feature in the architecture doc. Extensions to add:
- New verification `kind` field (language_proficiency / teaching_credential / identity)
- Multi-verification per teacher (we want each credential listed separately)

Refactor minimally when adding the kinds.

### `backend/routers/notifications.py` — KEEP
**55 lines.** List, mark-as-read, mark-all-as-read.

Minimal, clean. Use as-is.

### `backend/routers/groups.py` — KEEP (with small fixes)
**75 lines.** Language groups CRUD.

Has `logger.info(f"All LanguageGroups found: {all_groups_results}")` and similar — debug logging that's probably stale. Remove.

### `backend/services/gamification.py` — KEEP
**45 lines.** `award_achievement` helper.

Clean. Use as-is.

---

## Frontend

### `frontend/src/App.jsx` — REFACTOR
**80+ lines.** Router setup, role-gated routes.

Clean structure. Replace step-by-step as we re-skin each page. The route definitions stay almost identical; we just swap the imported page components.

### `frontend/src/api/client.js` — KEEP (with small fixes)
**26 lines.** Axios instance + JWT interceptor + 401/403 → logout redirect.

Clean. Fixes:
- Remove the `console.log("Axios client baseURL: ...")` debug print
- The 401/403 handler triggers `window.location.href = '/'` which is a hard reload — fine but loses React state. OK for an auth wipe.

Worth porting almost verbatim to TSX with proper types.

### `frontend/src/context/AuthContext.jsx` — REPLACE
**~65 lines.** Token in localStorage, fetch /users/me on token change, login/logout.

Functional but minimal. Replace with Vasso's AuthContext which has:
- Login-twice fix (await `/me` synchronously in login)
- Email-verified gating
- Better typed user model

### `frontend/src/context/InboxContext.jsx`, `ToastContext.jsx` — KEEP
Inbox context manages WebSocket connection + unread count. Toast is standard notification system. Both keep mostly intact, port to TSX.

### Pages directory (16 top-level + admin/student/teacher subdirs) — REWRITE (all of them)
**6,271 lines total.** Every page uses Tailwind utilities.

Concrete file list:
- `Landing.jsx` — old marketing page; **replace** with the kotobaseed.net marketing site using our kit-marketing-site design system + the new product positioning
- `Login.jsx`, `Register.jsx` — replace with Vasso's flows (TSX, email verification)
- `Pricing.jsx` — rewrite to reflect Starter/Pro/Marketplace pricing from the architecture doc
- `ProjectList.jsx`, `ProjectDetail.jsx` — re-skin with our `kit-lesson-player` style (the marketplace pages)
- `RequestList.jsx` — same
- `Inbox.jsx` (541 lines!) — split into smaller components, re-skin
- `Profile.jsx` (383 lines) — re-skin
- `Settings.jsx` (250 lines) — split: account settings vs site customization
- `TeacherReviews.jsx`, `TeacherArchive.jsx`, `Archive.jsx`, `Groups.jsx`, `ArchivedConversations.jsx` — re-skin
- `admin/` (AdminDashboard, ProjectManagement) — re-skin with `kit-admin` design system, add drawer pattern
- `student/`, `teacher/` subdirs — re-skin

Recommendation: **don't** try to convert these one-by-one — most need fresh design treatment for the kotobaseed brand anyway. As we port each backend module into the multi-tenant structure, we rebuild its UI from scratch using the design system. The old JSX serves as reference for the data flows + state machines.

### Components directory — Mostly REPLACE
Same logic: components like `Navbar.jsx`, `Footer.jsx`, `ConfirmationModal.jsx`, `ProjectCard.jsx`, etc. — keep them as JSX reference, build new TSX equivalents with the design system. The `VideoPlayer`, `VideoUpload`, and `LinkVideoModal` have real logic worth porting; the rest are presentational.

### Tailwind setup — DELETE eventually
CompInput uses Tailwind + Chakra UI. Kotobaseed uses our kit CSS files (from Vasso's design system). Phase 1+2: keep Tailwind compiled in for legacy pages; new pages use the kits. Phase 3+: remove Tailwind once all pages are migrated.

---

## Stray files to delete

- `identifier.sqlite` at repo root — looks accidentally checked in
- `branding/Logo - Rectangle.png` — fine to keep but rename without spaces
- Probably more once we start the actual port

---

## Recommended order of operations

This is the actionable checklist coming out of the audit. Pick this up after
the architecture doc has been reviewed.

### Step 0 — Safety net (one session)
1. Fix the critical security defaults (SECRET_KEY + webhook secret fallbacks)
2. Add Alembic + a baseline migration matching current schema
3. Add a minimal pytest fixture (DB setup, client fixture, dummy user creation)
4. Add tests for the existing pledge webhook flow (proves we won't break it)
5. Set up `pyproject.toml` (replace bare `requirements.txt`) + `ruff` linter

### Step 1 — Cross-cutting refactor (one session)
1. `datetime.utcnow()` → `datetime.now(timezone.utc)` everywhere (sed-able)
2. Pydantic v1 → v2 patterns (`.dict()` → `.model_dump()`, etc.)
3. `@app.on_event` → lifespan
4. Centralize Stripe client init in `services/stripe_client.py`
5. Standardize logging (drop `print()`, use `logger`)

### Step 2 — Schema migration for multi-tenancy (one session)
1. Add `tutors` table + the related tables from the architecture doc
2. Add `tutor_id` foreign keys to the tenant-scoped tables we're about to port from Vasso
3. Run migration locally; back up existing data

### Step 3 — Auth replacement (one session)
1. Port Vasso's `auth.py` (email verification, login-twice fix)
2. Port Vasso's `students.py` (account management, GDPR)
3. Update CompInput's `users.py` to be just the public/admin views of users; account self-serve moves to the Vasso-style account router

### Step 4+ — Phase 1 begins (multi-session)
Follow the phased plan in `ARCHITECTURE.md`. Each Phase 1 session takes one
chunk: tenant resolution middleware → subdomain routing → kotobaseed.net
marketing site → tutor signup → Stripe Connect Express onboarding → first
"hello world" tutor site.

---

## Summary table

| File | Verdict | Effort | Notes |
|---|---|---|---|
| backend/main.py | REWRITE | S | Tiny but full replacement |
| backend/database.py | REFACTOR | S | Postgres default, pool pre-ping |
| backend/deps.py | KEEP | XS | Tiny tweaks |
| backend/security.py | REFACTOR | S | Critical: fix SECRET_KEY fallback |
| backend/models.py | REFACTOR | M | Add tenant fields, split file, fix patterns |
| backend/schemas.py | REFACTOR | S | Pydantic v2 conversion |
| backend/routers/auth.py | REPLACE | S | Use Vasso's auth |
| backend/routers/projects.py | REFACTOR | M | Fix N+1, extract tips, fix Pydantic |
| backend/routers/pledges.py | KEEP | XS | Mostly leave alone |
| backend/routers/conversations.py | REFACTOR | L | Split file, fix N+1 |
| backend/routers/requests.py | REFACTOR | M | Untangle Priority credits |
| backend/routers/videos.py | KEEP | XS | Trivial |
| backend/routers/ratings.py | KEEP | XS | Trivial |
| backend/routers/admin.py | REFACTOR | S | Extract services, add audit log |
| backend/routers/subscriptions.py | REPLACE | M | Different product meaning |
| backend/routers/verifications.py | KEEP | S | Add `kind` field |
| backend/routers/notifications.py | KEEP | XS | As-is |
| backend/routers/groups.py | KEEP | XS | Remove debug logs |
| backend/services/gamification.py | KEEP | XS | As-is |
| Backend tests | ADD | M | New work |
| Frontend pages | REWRITE | XL | Spread across phases as we port |
| Frontend components | REPLACE | L | Build TSX equivalents using design system |
| Frontend Tailwind setup | DELETE | XS | Phase 3+ |

Effort key: XS (15 min), S (1 hr), M (half day), L (full day), XL (multi-session).

Cumulative refactor effort, not counting new Kotobaseed features: roughly
3–5 focused sessions for the backend, then phase-driven UI rebuilds as we
go. Phase 1 multi-tenant foundation work starts after Step 4 above.

---

*Last updated: 2026-06-05. Audit by Claude, judgments to be confirmed by Sophia.*
