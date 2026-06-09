# Audit pass — 2026-06-07

Sophia called for an honest audit of everything that landed today
**before we move on**. Two parts:

1. **Hotfix review** — every change made in this session, classed as
   solid / needs polish / risky-but-shipped. Where I cut corners, this
   says where and what it would cost to do properly.
2. **Chat professional-grade review** — the messaging system from
   first principles: do we have what a launch needs?

I am the one who shipped this work; I am also the one writing this
audit. I have tried to be honest about my own corners but should not be
the only reviewer.

---

## Part 1 — Today's changes, classed for fragility

### Slice E — Playwright scaffold

| Item | Verdict | Notes |
|---|---|---|
| `frontend/playwright.config.js` + `tests/e2e/` | **Solid** | Auto-starts the backend via `start-backend.sh` (Sophia-observable: works without manual setup). Two specs green. |
| `services/stripe_connect.py` test-mode short-circuit (returns fake `acct_test_...` IDs when `ENVIRONMENT=test`) | **Polish needed** | Right now the Stripe stub leaks into any non-test invocation that happens to set `ENVIRONMENT=test`. The check is correct but I should add a single explicit `assert settings.environment == "test"` at the top of the test helper so production cannot ever silently use it. Low risk because prod sets `ENVIRONMENT=production`. |
| `services/stripe_connect.py` `fetch_account` auto-returns `charges_enabled=True, payouts_enabled=True` in test | **Polish needed** | Same concern as above. The test-mode auto-approval is the right shortcut for Playwright but means a future test of the actual `PAUSED_KYC` UI surface is impossible without overriding. Worth refactoring into an injectable fixture. |

### Slice A — Mark complete + no-show

| Item | Verdict | Notes |
|---|---|---|
| `BookingStatus.NO_SHOW` added to enum | **Solid** | Already deployed; alembic migration in place. |
| `POST /bookings/{id}/complete` timing gate | **Solid** | `now < scheduled_at + duration - 5min` rejects. Idempotent. Tested. |
| `POST /bookings/{id}/no-show` new endpoint | **Solid** | 15-minute grace, idempotent, emits in-app notification. Tested. |
| `BookingsManager.jsx` dual buttons with disabled tooltips | **Solid** | Tooltips reflect server times. |
| Backend tests (`test_mark_complete_no_show.py`) | **Solid** | 9 tests, all green. |
| Playwright spec (`mark-complete.spec.js`) | **Solid** | 2 specs, all green. |

### Slice B — Auth surface finishing

| Item | Verdict | Notes |
|---|---|---|
| WS endpoints read cookie via `_ws_auth` | **Solid** | Cookie preferred, query-param fallback for legacy clients. |
| `get_current_user_optional` checks `token_invalidation_at` | **Solid** | Matches `get_current_user` now. |
| `StaffSupport.jsx` + `ModulesStorefront.jsx` swap `token` → `currentUser` | **Solid** | Same shape as the earlier sweep. |

### Slice C — Lifecycle hardening

| Item | Verdict | Notes |
|---|---|---|
| Recurring generator skips slots inside `lead + cutoff` | **Solid** | Tested by existing recurring tests + reasoning. |
| Cancel endpoint idempotent for CANCELLED/REFUNDED | **Solid** | Inline serializer (no helper extracted yet — see Slice D). |

### Slice D — Frontend hygiene

| Item | Verdict | Notes |
|---|---|---|
| `frontend/src/utils/errors.js` | **Solid** | Single helper; behaviour-preserving. |
| `frontend/src/utils/dates.js` | **Solid in isolation** | The helper itself is correct. **But** the **automated sweep** that consumed it broke two files (Inbox.jsx + GroupClassesPanel.jsx) by creating self-recursive helpers — **stack-overflow bug** that hit Sophia. Both now fixed and deployed. **This is the most fragile thing in today's batch.** See "What broke" below. |
| `frontend/src/components/Avatar.jsx` | **Solid in isolation** | Component is correct but **only adopted in `Tutors.jsx` and `Profile.jsx`** so far. ~10 inline `ui-avatars.com` fallbacks remain. Low-risk to leave for incremental adoption. |
| `frontend/src/components/BookingCard.jsx` | **Scaffolded, not consumed** | The component exists and is correct, but `MyBookings`, `BookingsManager`, `NextLessonCard`, `NextLessonBanner` still each render their own row markup. Schema-side unification (`counterparty_name`) is wired, so adoption is now mechanical and incremental. |
| Backend `counterparty_name` field on both booking schemas | **Solid** | Defaulted to `None` to keep older callsites valid; a `model_validator` fills it from `tutor_display_name`/`student_name` when omitted. Tested via the cancel-policy regression that surfaced an unset field. |

### Schema additions today

| Item | Verdict | Notes |
|---|---|---|
| `Booking` schemas now emit `Z`-suffixed ISO strings via `field_validator(mode='before')` | **Solid** | Fixes the timezone-display bug Sophia hit. Coverage: `scheduled_at`, `paid_at`, `completed_at`, `cancelled_at`, `refunded_at`, `created_at`. **Other endpoints elsewhere in the codebase still emit naive datetimes** (e.g. `/admin/audit-log`, `/tutor/analytics`); they were not user-visible bugs today but could be. Worth a sweep. |
| `Conversation.request_id` nullable + migration `20260620b` | **Solid** | Required for direct DMs. Old conversations unaffected. |
| `Conversation.student_initiated` + `tutor_first_responded_at` + migration `20260620c` | **Solid** | Drives the teacher-must-respond-first rule. |
| `Tutor.min_booking_lead_minutes` + migration `20260620a` | **Solid** | Already shipped in the prior turn. Wired into both slot walkers. |

### Conversations refactor

| Item | Verdict | Notes |
|---|---|---|
| `_create_conversation_read` and `_create_conversation_summary_read` made nullable-request-safe | **Solid** | Fixed the 500s Sophia reported on `/conversations/summary`, `/`, `/1`. |
| `ConversationRead.request: RequestRead \| None` (schema change) | **Solid** | Backwards compatible for marketplace conversations. |
| `POST /conversations/with/{user_id}` find-or-create | **Solid** | Validates self / not-found / picks teacher/student by role. |
| Initial-message gate on send-message | **Solid** | Tested locally; rule applies only when `student_initiated == true`. Tutor-initiated DMs bypass it. |
| `/users/me/tutors` endpoint + `Tutors.jsx` page + Navbar entry | **Solid** | Stats sort sensibly. Avatars via the shared component. |

### Minute tracking

| Item | Verdict | Notes |
|---|---|---|
| Split `used` vs `reserved` in `QuotaSummary` | **Solid** | Honest reading of the ledger. NO_SHOW counts as used (tutor's room was held). |
| `MinuteUsageCard.jsx` stacked bar (reserved behind used) | **Solid** | Sophia's spec: "used is actual; reserved is a different colour." |
| Group-session minutes are categorised as "reserved" | **Polish needed** | We don't track post-session completion on the `group_session:N` source today, so the bar pessimistically labels them reserved forever. Tracking actual delivery on group sessions is a small follow-up. |

### What broke today (and why) — the fragility honest section

1. **Date-sweep regex caught self-referential aliases.** My sweep replaced `new Date(x).toLocaleString()` with `formatDateTime(x)` everywhere — including inside files that **already defined** a local `formatDateTime` whose body was that same expression. The result was `const formatDateTime = (x) => formatDateTime(x)`, an infinite recursion that crashed two pages. **What it would cost to do this properly:** the sweep should check for an existing local declaration with the same name and either rename or skip the file. A 30-line addition to `/tmp/koto-sweep.py` would have caught both files. Both files now fixed; the script in `/tmp` would still have the same bug if re-run.

2. **Counterparty schema was non-optional initially.** I added `counterparty_name: str | None` (non-defaulted) to `StudentBookingRead`. Other call sites that hadn't been updated 500'd on the next request. Caught by `test_cancel_allowed_outside_cutoff` failing. Made the field optional with a `model_validator` fallback — that's the correct architecture; I should have done it that way the first time.

3. **Stripe test-mode short-circuit in `stripe_connect.py`** is a real change that affects production behaviour if `ENVIRONMENT=test` is ever set there. The chance is low but the failure mode would be "tutors silently bypass KYC" — bad. Should be belt-and-braces with an assertion.

4. **Backend container rebuilds without `--build` silently kept old code.** I caught this on the timezone fix (re-ran with `--build`) but if a future deploy uses `--force-recreate` without `--build`, only the entrypoint code reloads. Worth documenting in the deploy doc as "always pass `--build` after backend changes."

### What I should do to harden before more work

- Add the local-declaration check to `/tmp/koto-sweep.py` (or delete the script and write a one-off `find-and-fix-this` checklist for incremental refactors).
- Assert `settings.environment == "test"` in the Stripe stub.
- Sweep other `datetime`-returning Pydantic schemas in the codebase and add the same `mode="before"` UTC normaliser. Specifically: anything in `/admin/`, `/staff/`, `/tutor/analytics`, `/users/me/projects`, the AuditLog.
- Write a Playwright spec that opens the Inbox after creating a fresh conversation — that test would have caught the stack overflow before deploy.

---

## Part 2 — Chat system, professional-grade review

The audit you asked for: is the chat ready to host real conversations
between real students and real tutors? My honest answer is **most of
the foundations are right, several real launch-blockers remain.**

### What's strong

- **Auth model is clean.** WS now reads the cookie; HTTP reads cookie
  or `Authorization`. No tokens in URLs for the cookie-aware clients.
  `token_invalidation_at` is enforced on both paths.
- **State machine is well-defined.** `ConversationStatus` (OPEN /
  CLOSED), explicit close transitions, student-initiated tracking,
  archive view. Messages have a typed `message_type` (text, offer,
  demo_request, demo_video) so we can grow without schema churn.
- **Reply support.** `replied_to_message_id` lets a message anchor to
  another. Rendered correctly in the UI.
- **WebSocket fan-out** through `manager.connect_conversation` /
  `connect_user`. Realtime read receipts are wired.
- **Find-or-create endpoint** prevents duplicate threads between the
  same pair. Symmetric lookup (works whichever side opens it).

### What's missing or risky for a launch — in priority order

#### 1. **Inbox has a known UX fragility from the recursive-helper bug**

Pages like Inbox and GroupClassesPanel had a self-recursive
`formatDateTime` declaration that I just fixed. The kind of bug that
crashes only at runtime on real data. We need a **Playwright spec that
opens Inbox after a fresh conversation** so this class of bug can never
ship again. **Estimated: half-day to write the spec + fixtures.**

#### 2. **No moderation surface**

A tutor receiving abuse from a stranger via "Message tutor" has
nowhere to flag it. No report, no block, no mute, no admin queue. The
support ticket system exists (`/support`) but it's for "I have a
question", not "this user is harassing me." **Launch blocker for any
public marketplace.** Needs at minimum:
- A "Report message" / "Report user" button on each message and
  conversation header.
- A `Report` model (reporter, target user, target message, reason,
  status).
- An admin queue at `/admin/reports` for triage.
- A user-side **Block** that hides messages and prevents future
  conversations.

#### 3. **WS message envelope is brittle**

`Inbox.jsx` parses every incoming WS frame as JSON and switches on
`data.type` with string equality. There's no message-version field,
no schema validation, and the client trusts whatever shape arrived.
If we add a new message type, every existing client crashes the
moment a tutor on a stale tab receives one. **Should add a `version`
field and a default "ignore unknown type" branch.** Not glamorous,
but a 30-minute fix that earns a lot of margin.

#### 4. **No rate-limiting on `send_message`**

A logged-in user can fire `POST /conversations/{id}/messages` in a
tight loop. There's no DB-level cap, no app-level throttle. Combined
with the find-or-create endpoint, an attacker could open conversations
with every tutor in the DB and spam them. **Add slowapi rate-limiting:**
- 30 messages / minute / user
- 5 new direct conversations / hour / user (much stricter — opening
  a thread is the expensive operation socially)

#### 5. **Initial-message gate has an escape hatch**

The teacher-must-respond rule only applies to *direct* conversations
opened via the booking flow or "Message tutor." Marketplace-request
conversations (the legacy CompInput path) are not gated. Need to decide
explicitly: do those still exist as a launch concept? If yes, the rule
needs to extend to them too.

#### 6. **No message editing or deletion**

A student who fat-fingers an embarrassing intro message in their
trial booking has no way to fix it. A tutor cannot retract a sent
offer. Neither is in scope for v1 if you want minimal surface, but
both are user-expected on every chat surface they've ever used.
**Pragmatic minimum:** soft-delete by the sender within 60 seconds
("undo send"). Three new endpoints + a column on `Message`.

#### 7. **Attachments not supported**

Images, PDFs, voice notes — none of those are first-class. We have
`message_type='demo_video'` but that's a URL field; there's no
upload path. For a tutor sending a worksheet PDF or a student
sharing a recording, this is the next painful gap. Out of scope for
v1 if the brief is "open the conversation, then handle attachments
in the lesson," but worth knowing.

#### 8. **No "typing…" indicator, no read-receipt UI**

The backend handles `READ_RECEIPT` over WS but the client does
nothing visible with it. No typing indicator at all. Both are
user-expected polish; both are 1-2 day items each. Not blockers,
but the inbox feels lifeless without them.

#### 9. **Inbox 544 lines, one file, lots of inline JSX**

`Inbox.jsx` is hard to read and harder to test. The single-file
sprawl is what hid the self-recursive helper bug — nobody could
visually pattern-match it. Worth a refactor pass once we know the
shape of the moderation + attachments work, because both will land
inside that file. **Estimated: 2 days, no behaviour change.**

#### 10. **No conversation search**

A tutor with 100 students cannot find the conversation with "Sara".
The UI lists conversations, but there's no filter, no search by
participant name. Not a v1 blocker but it'll be the first complaint
once tutor inboxes have any depth.

### What I would ship before launching the chat publicly

A minimum "professional grade" sprint:

- Playwright Inbox spec (catches the next regex sweep accident).
- Report user + Report message + admin queue + Block.
- Rate-limit `send_message` (30/min) and `find_or_create` (5/hour).
- Add `version` field to WS messages + ignore-unknown branch.
- "Undo send" within 60 seconds.

That's ~5 days of focused work. The rest (attachments, typing,
read-receipt UI, search, Inbox refactor) is post-launch polish.

---

## Where this leaves us

**Solid and shippable today**: everything in Slices E, A, B, C; the
schemas + booking timezone fix; the conversations 500 fix; the
minute-tracking split; the new `/conversations/with`, `/users/me/tutors`
endpoints.

**Needs the small fixes above to be defensible**: the Stripe test-mode
stub (assertion), the date sweep tooling (local-declaration guard),
the remaining naive datetimes in other schemas (sweep).

**Genuine launch blockers in the chat system**: moderation surface,
rate limiting, WS message versioning.

**Polish later**: BookingCard adoption sweep, Avatar adoption sweep,
migration rename, "undo send," attachments, typing/read indicators.

Tell me which of the chat blockers you want me to start on — I'd
suggest the rate-limit + report-message + admin queue as the
highest-leverage first slice.
