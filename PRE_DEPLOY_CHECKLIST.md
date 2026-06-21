# Pre-deploy checklist (staging walk)

The narrow checklist you run **on staging before tagging every prod release**.
This is the operational sibling to `E2E_TESTING.md` — that doc is the
exhaustive one-time launch audit; this one is what Sophia walks each time
to confirm the current build is shippable.

If any item fails on staging, fix it and re-walk that section. Do not tag a
release until every item below is green.

**URL under test:** `https://demo.kotobaseed.net` (staging).
**Browser:** incognito window or a fresh profile so no cookies hide bugs.

---

## A · Smoke (90 seconds, run first)

- [ ] Apex `/` loads, no console errors
- [ ] `/library` lists tutors
- [ ] `/discover` shows the feed
- [ ] `/api/healthz` returns 200 JSON
- [ ] Every top-nav link stays on `demo.kotobaseed.net` (no leak to `kotobaseed.net`)
- [ ] Logo image in the top nav loads

If any of these fail the staging deploy is broken. Don't proceed.

## B · Demo signup paths

- [ ] `/try` shows the role chooser
- [ ] "Try as a student" with a fresh email → lands on `/discover` with seeded content + the demo bar
- [ ] "Try as a tutor" with a fresh email → lands on `/try/tutor/build` (brand wizard)
- [ ] Wizard: theme picker click → theme changes; Continue
- [ ] Wizard: bio paste + portrait upload (R2 receives the file); Continue
- [ ] Wizard: display name + languages; Continue
- [ ] Wizard: preview iframe renders the tutor site; "Open my dashboard" crosses to `<slug>.demo.kotobaseed.net/dashboard`
- [ ] "Skip to dashboard" works from any step

## C · Page builder

- [ ] Site → Page builder opens, current layout renders
- [ ] Drag a section row to reorder — drop is sticky
- [ ] Edit a text field — status indicator goes "Editing… → Saving… → Saved Xs ago" within ~1 second
- [ ] No Save button is present
- [ ] Reload the page — your edit persisted
- [ ] Section picker shows the three Tier-2 blocks labelled "(schools)": Team roster, Programs showcase, Booking CTA
- [ ] Add a TipTap-backed section (e.g. About). Toolbar shows B / I / H2 / list / quote / Link / Image / undo / redo
- [ ] Click Image → file picker opens → selected image uploads + appears in the editor

## D · Chat — desktop

- [ ] Open a conversation. Top nav, sidebar, thread all render side-by-side
- [ ] Type → typing indicator shows on the peer in another tab
- [ ] Send a text message — lands instantly in both panes
- [ ] Send an image attachment — uploads + renders inline
- [ ] Hover your own message within 60s — Undo button appears; click; message becomes "deleted" in both panes
- [ ] Reply on a peer message — composer shows the quoted preview
- [ ] Report → submit → conversation appears in `/admin/reports`

## E · Chat — mobile (real phone or DevTools 375px)

- [ ] Apex `/messages` shows only the conversation list (no thread visible)
- [ ] Tap a row → thread fills the screen, back arrow appears
- [ ] Tap back → returns to the list
- [ ] Open the composer → tap targets feel ≥44px (no accidental misses)
- [ ] Open soft keyboard → composer stays in frame, messages scroll under it
- [ ] Send button reachable with one thumb

## F · Rate limits

- [ ] Fire 31 messages in <60s — the 31st returns the "slow down for a minute" 429
- [ ] Wait ~60s, send works again
- [ ] WS typing: spam the input rapidly for ~10s — the peer's typing dot stays steady (no fanout spam)

## G · Schools blocks (if a Business / school tenant is available)

- [ ] Add Team roster to the page — cards render for every team member
- [ ] Add Programs showcase, paste 2 valid module slugs — modules render
- [ ] Add Booking CTA → renders with the gradient panel + button
- [ ] On a solo tenant the Team roster section auto-hides itself

## H · Conversion handoff

- [ ] As a demo tutor session, open the demo bar's Convert button
- [ ] Set password modal opens — name + 8+ char password + GDPR tick
- [ ] Submit → for tutor, button reads "Convert + set up payouts"
- [ ] On success the browser is handed to Stripe Express onboarding (test mode)
- [ ] Return URL drops you back at `/teacher/dashboard?stripe_return=true`
- [ ] Demo bar is gone. Brand-wizard work (theme, bio, photo, page sections) is preserved on the real account

## I · Datetime handling

- [ ] Open Notifications — recent timestamps render correctly in your local time (not an hour off in CEST)
- [ ] Open a Support ticket if any exist — created_at + last_activity_at correct
- [ ] Admin → Audit log — created_at correct
- [ ] Open a Recurring booking plan — start_date + created_at correct

## J · Cron + scheduler

- [ ] On staging: `ssh root@138.199.167.136 'docker compose logs backend --since 24h | grep -E "dormant_pause|booking_reminders|demo_trials_sweep|demo_janitor|db_backup"'`
- [ ] Each job has either a "complete" or "already ran today" line in the last 24h
- [ ] `demo_trials_sweep` is in the list

## K · Sentry + backups

- [ ] Trigger a deliberate 5xx (e.g. malformed admin request)
- [ ] Within ~30s the Sentry project shows the event
- [ ] `ls /opt/kotobaseed/data/backups/ | tail -3` shows a snapshot within the last 24h
- [ ] R2 offsite count > 0 (check via R2 dashboard or `/api/admin/r2-status` if exposed)

## L · Maintenance banner dry-run

- [ ] As admin, schedule a banner ("dry run") for now+1m
- [ ] Sign out, refresh apex — banner shows
- [ ] Sign back in, retract the banner
- [ ] Banner clears on next load

---

## Sign-off

When **A through L** are all green, you're cleared to tag a prod release.

```bash
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

Then:

1. In the admin panel, schedule the production maintenance banner ≥12h ahead.
2. Go to GitHub Actions → Deploy production → Review deployments → Approve.
3. After the deploy finishes, walk **A** and **D** on prod (`https://kotobaseed.net`) as a smoke pass.
4. Retract the maintenance banner.

If anything broke between staging and prod that the staging walk didn't catch — note it here and add a new section so the next release catches it.

---

## Deeper coverage

`E2E_TESTING.md` is the exhaustive one-time launch audit. Walk it whenever
a major surface gains a new flow (e.g. a Phase B feature, a new tier, a new
content type). This checklist is what runs on every release.
