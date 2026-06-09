# Kotobaseed end-to-end testing checklist

> This walks you through every user-facing flow on the live test deployment.
> The platform is currently on **Stripe test mode** — use card `4242 4242 4242 4242`
> with any future expiry, any CVC, any postcode. No real money moves.
> When every box below is checked we flip Stripe to live keys.

**Live URL:** https://kotobaseed.net
**API:** https://api.kotobaseed.net
**Admin login:** `shiho@sakurastudios.eu` — password is in your password manager (was sent once in chat; if you didn't stash it, log in via the recover-password flow)
**Stripe webhook (test):** `https://api.kotobaseed.net/pledges/webhook`

---

## Test data hygiene — important before you start

To keep the launch clean, **every account, booking, article, module, theme order, team, or other entry you create during testing should use a predictable email pattern** so we can purge it all in one shot when E2E is green.

We use **Gmail `+` aliases** off your real address. Gmail delivers `sophiawillowood+anything@gmail.com` straight to your `sophiawillowood@gmail.com` inbox, so verification emails, invite links, magic links etc all actually arrive — but every alias stays uniquely identifiable for cleanup.

Use this convention for every test account you register:

- Tutors: `sophiawillowood+tutor1@gmail.com`, `sophiawillowood+tutor2@gmail.com`, …
- Students: `sophiawillowood+student1@gmail.com`, `sophiawillowood+student2@gmail.com`, …
- Team invites: `sophiawillowood+invite1@gmail.com`, …

When testing is done, the assistant runs `python -m backend.scripts.cleanup_test_data` on the server, which cascade-deletes:

- Every `User` matching `sophiawillowood+%@gmail.com`
- Every dependent row they own (Tutor, TutorTeam, TutorTeamInvite, Booking, Article, LessonModule, Subscription, CustomThemeOrder, AdminGrant, MinutePack, TutorProtectedStudent, etc.)
- Any Stripe customer/subscription/coupon created by those users (test mode only)

**Excluded by name:** your base `sophiawillowood@gmail.com` and the admin `shiho@sakurastudios.eu`. The script aborts if either ever lands in the target set.

---

## 0. First-touch sanity

- [x] Visit https://kotobaseed.net — homepage loads with green padlock, no console errors
- [x] Top nav looks right: Find a tutor · Pricing · For tutors · Log in · Get started
- [x] Click **For tutors** → tutor getting-started guide renders with TOC + 12 chapters
- [x] Click **Pricing** → renders without errors
- [x] Visit https://api.kotobaseed.net/healthz → `{"ok":true,"service":"kotobaseed"}`
- [x] Visit https://api.kotobaseed.net/readyz → `{"ok":true}`

## 1. Admin login + admin dashboard

- [x] Log in with the admin credentials → lands on / (apex)
- [x] Click avatar → user menu shows Admin dashboard, Settings, Logout
- [x] Click **Admin dashboard** → loads stats + button row (Audit log, Database, Settings, Staff, Support queue, Affiliates, Project Management)
- [x] **Database** panel: migrations show **Up to date**; click "Take backup now" → toast shows new dump file in list

## 2. Tutor signup + Stripe Connect

- [x] Open an incognito window
- [x] Click **Get started** → register as `vasso@example.com` (or any new email)
- [x] Verify email via the 6-digit code (check inbox at the email you used)
- [x] On signup it should redirect to Stripe Connect onboarding (Express flow)
- [x] Complete Connect with **test data**:
  - Email: anything
  - Phone: `0000000000`
  - DOB: any past date
  - Address: any (test mode is permissive)
  - Bank: routing `110000000`, account `000123456789`
  - SSN/ID test value: `000000000`
- [x] Back at Kotobaseed dashboard, the **Money** tab should say "Payouts are live"

## 3. Tutor onboarding wizard

- [x] On the dashboard overview, the "Onboarding · 0/12" card shows up
- [x] Click **Start tour** → opens module 1 (Welcome)
- [x] Click **Mark complete & continue** → advances to module 2 (Stripe Connect), counter ticks to 1/12
- [x] Open module 5 (Availability) via the sidebar → opens
- [x] Close the tab, log out, log back in
- [x] Open `/onboarding/tutor` → wizard resumes at module 5 (or wherever you left off)
- [x] Click **Restart from the beginning** → counter resets to 0/12

## 4. Tutor profile + lesson packs + availability

- [x] Site section → Profile editor: set display name, languages, short bio, upload a photo
- [x] Lessons section → Lesson packs: create **two** packs
  - Pack A: name "30 min single", duration 30, price €15
  - Pack B: name "5-lesson bundle of 60 min", duration 60, 5 lessons, price €120
- [x] Lessons section → Availability: open up 3-4 weekly windows (e.g. Mon/Tue/Wed 14:00–18:00)
- [x] Lessons section → Free trial settings: turn it on for one window, 15 minutes
- [ ] Lessons section → Cancellation: set to 24h

## 5. Themes + page builder + verifications

- [ ] Site section → Theme picker: switch to a different theme. Open your tutor URL `https://vasso.kotobaseed.net` in a new tab → palette changes
- [ ] Site section → Page builder: reorder sections, save. Refresh tutor URL → order updates
- [ ] Site section → Verifications: submit one "language proficiency" credential (e.g. "DELE C2", Spanish, evidence URL anywhere)
- [ ] In another tab as admin, go to `/admin/database` → confirm there's a "tutor.verification" audit-log entry (or check `/admin/audit-log`)
- [ ] As admin via API or admin queue → approve the credential
- [ ] Refresh the tutor's public site → badge appears on the hero

## 6. Student signup + book paid lesson (Stripe test card)

- [ ] Another incognito window → visit `https://vasso.kotobaseed.net`
- [ ] Click **Book a lesson** → register as `student@example.com`
- [ ] Verify email
- [ ] Pick Pack A → confirm a slot
- [ ] Redirects to Stripe Checkout — pay with `4242 4242 4242 4242` exp `12/30` CVC `123`
- [ ] Returns to `/booking/success` page
- [ ] In a tab logged in as the tutor → Dashboard → Bookings → see the new confirmed lesson
- [ ] Tutor inbox: notification "New booking confirmed for …"
- [ ] Email: student receives booking confirmation, tutor receives "new booking" email
- [ ] In admin → Database → migrations still up to date

## 7. Free trial booking

- [ ] As the student (logged in) → visit the tutor's site
- [ ] Click the **Free trial** CTA → pick a trial-eligible window
- [ ] Confirms instantly (no Stripe checkout)
- [ ] Booking appears as confirmed for both tutor + student
- [ ] Try to book a SECOND trial with the same tutor → blocked with "already booked your free trial"

## 8. Classroom join + complete

- [ ] As the tutor, on the dashboard overview, the **Next lesson** card shows the upcoming booking with countdown
- [ ] Use the admin DB panel or SSH to manually move `scheduled_at` to ~5 minutes from now (or wait for it to arrive naturally)
- [ ] Refresh dashboard → Join classroom button lights up 15 min before
- [ ] Click **Join classroom** → Daily.co room opens, camera/mic work
- [ ] As the student, in another browser, visit `/classroom/{booking_id}` → joins the same room
- [ ] End the lesson, go back to tutor dashboard → Bookings → click **Mark complete**
- [ ] Booking shows as completed; classroom_minutes_used_this_cycle increments

## 9. Cancellation + refund

- [ ] Book another paid lesson (steps 6) far enough out to be outside cutoff
- [ ] As the student → My bookings → Cancel
- [ ] Stripe refund issues, booking flips to REFUNDED
- [ ] Email "your lesson was cancelled" arrives
- [ ] In tutor dashboard → Bookings → see the refund

## 10. Recurring weekly bookings

- [ ] As the student, book a lesson with "Make this a recurring weekly" ticked
- [ ] Pay via Stripe checkout (first lesson)
- [ ] In student dashboard → Recurring lessons card lists the plan
- [ ] Confirm 3 future bookings appear as PENDING_PAYMENT
- [ ] Cancel one of the future bookings → it goes away cleanly
- [ ] Cancel the plan → no new bookings get generated

## 11. Group classes

- [ ] As the tutor → Lessons → mark one pack as group (min 2, max 5)
- [ ] Lessons → Group classes → schedule a session 3 days from now with the group pack
- [ ] As the student, book a seat → Stripe checkout → booking goes to PENDING_GROUP_MIN
- [ ] Open a 2nd student account, also book a seat → both flip to CONFIRMED once min met
- [ ] Force the threshold to pass (or wait): all seats confirm
- [ ] (Test the min-not-met path with a separate session that has only one booking → at threshold the lesson cancels and Stripe refunds)

## 12. Homework

- [ ] Tutor → Students section → Build homework template: 3 vocab questions + 1 short-answer
- [ ] Assign the template to a student manually
- [ ] As the student → My assignments → Take quiz → answer → submit
- [ ] Auto-score appears for the vocab; short-answer goes to the grading queue
- [ ] As the tutor → Grading queue → grade the short-answer with feedback → submit
- [ ] Student gets email "your homework was graded"; sees feedback in their assignment view

## 13. Articles + newsletters

- [ ] Tutor → Content → New article → write a short post → publish
- [ ] Visit the tutor's public site → article appears in `/articles` index
- [ ] Click the article → renders with the tutor's theme
- [ ] Delete the article from the manager → toast shows undo
- [ ] Click **Undo** → article restored
- [ ] Tutor → Newsletters → compose a draft → preview → send to your own email as test → arrives in inbox

## 14. Subscriptions (Plus / Pro / Business) + minute packs

- [ ] /pricing → monthly/annual toggle switches the prices on every card
- [ ] **Tutors** section shows Free, Pro, Business; **Students** section shows Plus
- [ ] Click **Start 14-day trial** on Pro → goes to Stripe Checkout in subscription mode with the 14-day trial visible on the screen
- [ ] Pay with `4242 4242 4242 4242` exp `12/30` CVC `123`
- [ ] Returns to dashboard with Pro features unlocked (theme picker, page builder save, verifications submit)
- [ ] Inspect Stripe dashboard → the subscription shows `trialing` status with trial ending in 14 days
- [ ] Repeat the flow for **Business** subscription
- [ ] **Plus** subscription via the student dashboard

**Minute pack top-ups:**
- [ ] As a Pro tutor, dashboard → bookings → MinuteUsageCard shows a "Need more minutes?" CTA
- [ ] Click it → see the catalog (1,000 min €15 / 5,000 min €60)
- [ ] Click the 1,000 min pack → Stripe Checkout opens
- [ ] Pay with the test card → returns to dashboard
- [ ] MinuteUsageCard now shows "Plus 1,000 extra minutes from top-up packs"
- [ ] Schedule a booking that would have exceeded the base quota — succeeds, consumes from the pack

## 15. Referrals + affiliates

- [ ] As any signed-in tutor → /referrals → see your referral codes
- [ ] Copy a tutor-peer code, sign up as a new tutor in an incognito with `?ref=YOURCODE`
- [ ] Take a paid lesson with that new tutor (full circle: book + pay + complete)
- [ ] Original tutor's referral page should show a €5 milestone awarded

## 16. Custom domains

- [ ] As a Pro tutor → Site → Custom domain → enter `mytutor.example.com` (placeholder)
- [ ] System gives DNS instructions; status reads "pending"
- [ ] Verification requires real DNS (skip for the test pass unless you have a spare domain)

## 17. Admin: backups + migrations

- [ ] As admin → /admin/database
- [ ] Click **Take backup now** → new `database-{date}.dump` row appears
- [ ] Migration status reads **Up to date**
- [ ] Audit log records both events

## 18. Team management + non-compete (Business tier)

- [ ] Take Pro tutor account → upgrade to Business via Stripe Checkout (test card)
- [ ] Verify auto-created team appears in dashboard → Site → Team panel
- [ ] Rename the team via the inline form
- [ ] Invite a new email address → confirm Resend email arrives with accept link
- [ ] Open accept link in a new tab → verify "Invited as `<email>`" message + Login/Register CTAs
- [ ] Register fresh account with the invited email + tutor profile → click accept again → land on dashboard with Business features unlocked
- [ ] Adjust protection-days slider (0–365) → save → confirm value persists
- [ ] Buy an extra seat: change quantity from 0 to 2 → confirm Stripe subscription item created with proration; max_seats reflects 7
- [ ] Remove the member → confirm Tutor.team_id nulled
- [ ] Try to book a lesson with that ex-member as a student who studied with them in the team → expect 403 with "team you studied in" message

## 19. Custom theme order (Pro discount)

- [ ] On dashboard Site section, find Custom theme card
- [ ] Open brief form → fill audience / tone / language / inspiration links → choose Standard package
- [ ] Confirm estimated price reflects Pro 30% discount (€1,049)
- [ ] Submit → order created in DRAFT state, summary card appears
- [ ] Click "Pay €X deposit" → Stripe Checkout opens for half the total → pay with test card 4242…
- [ ] Returns to dashboard → status now DEPOSIT_PAID
- [ ] As admin → /admin/custom-themes → see new order → upload 3 concept previews (any URLs) + click "Mark concepts ready"
- [ ] Back as tutor → status CONCEPTS_READY → "Review concepts" button visible
- [ ] Open review → see 3 cards side-by-side → request revision once (notes textarea) → status REVISING
- [ ] As admin → upload revised concepts → status returns to CONCEPTS_READY
- [ ] As tutor → approve concept #2 → status APPROVED
- [ ] Pay €X final → Stripe Checkout → status FINAL_PAID
- [ ] As admin → attach valid TutorPageSection JSON layout (per DESIGNER_KIT.md) → click Finalize
- [ ] Visit tutor's public site → confirm the new layout renders + active_theme_id stamped

## 20. Admin grants

- [ ] /admin/grants → create TIER_UPGRADE Pro for a Free user, expires in 1 day → confirm target user's tier flips immediately
- [ ] Create MINUTE_PACK for a tutor (500 minutes) → confirm a MinutePack row appears with 500 remaining minutes
- [ ] Create LESSON_CREDIT (2 lessons, max 60 min) → confirm count_active_lesson_credits = 2 (via dashboard or API)
- [ ] As the target student → book a 60-min lesson with any tutor → confirm booking goes to CONFIRMED without Stripe checkout
- [ ] Confirm grant count decremented to 1
- [ ] Create DISCOUNT (50% off) → confirm grant is ACTIVE with no side effects yet
- [ ] Target user starts a Pro subscription via /pricing → Stripe Checkout should reflect 50% off → after payment, grant flips to CONSUMED
- [ ] Revoke an active TIER_UPGRADE → confirm target user's tier reverts to original

## 21. Discover feed

- [ ] /discover → page loads with hero + filter chips
- [ ] If no published content yet, see the "No content matches yet" empty state
- [ ] Once tutors publish articles, see those cards with tutor name + photo + language chip
- [ ] Click a language chip → filter narrows the list
- [ ] Click "Their site →" on a card → opens that tutor's public site in a new tab
- [ ] Click an article card → opens the article reader on the tutor's site

## 22. Marketing home

- [ ] / loads with the upgraded landing: refreshed hero copy, "+€186/mo" math block, 6 tutor feature cards, 3 student feature cards, SEO flywheel section, dual-audience final CTA
- [ ] "Start teaching" CTA → /onboarding/tutor
- [ ] "Find a tutor" CTA → /discover
- [ ] "Read the full getting-started guide" → /help/tutor-getting-started

## 23. Mobile sanity (open on phone)

- [ ] Apex homepage scrolls cleanly on a 360px viewport
- [ ] Tutor dashboard sections work on mobile
- [ ] Onboarding wizard sidebar collapses gracefully
- [ ] Classroom join button is tappable

---

## What to report back

For each section, mark **PASS** / **FAIL** with a one-line note. For any FAIL:
- Steps to reproduce
- What you expected vs what happened
- A screenshot if visual

We then fix every FAIL, you re-test those sections, and once everything's green
we rotate to **live Stripe keys** + **switch ENVIRONMENT to anything else if
needed**.

## When all green → switching to live mode

1. Stripe dashboard → toggle to **Live mode**, copy live `sk_live_…`
2. Live mode → Developers → Webhooks → create endpoint `https://api.kotobaseed.net/pledges/webhook` with the same five events, copy `whsec_…`
3. On the server, edit `/opt/kotobaseed/.env`, replace `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
4. `docker compose up -d --force-recreate backend`
5. First real booking — small amount, real card — verify the full flow once more
6. Announce
