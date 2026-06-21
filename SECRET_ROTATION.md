# Secret rotation runbook

What to rotate, how to rotate it, where to paste the new value, and what
to test after. Aimed at Sophia — every step is "click here, copy this,
paste there" with no in-flight guesswork.

## Why rotate

Six categories of credentials were generated or shared in dev/laptop
contexts during the launch ramp-up and are now load-bearing for paying
tutors on LIVE Stripe. Rotating closes the gap between "key may have
leaked into chat / a screenshot / a forgotten env file" and "key is
fresh and only lives where it has to."

Order them by **blast radius** — Stripe + Resend first (real money +
real customer email), then everything else.

## Before you start

- Open the password manager (1Password / Bitwarden — wherever you store
  these). You'll save every new value here as you go.
- Open two terminal windows: one SSH'd to **prod** (`root@167.233.29.52`),
  one SSH'd to **staging** (`root@138.199.167.136`).
- The .env file on each server lives at `/opt/kotobaseed/.env`. We edit
  it with `nano` or `vim` — never commit it anywhere.
- Have `https://demo.kotobaseed.net` open in a browser ready to smoke-test.

After **every** rotation, restart the backend on both servers:

```bash
ssh root@167.233.29.52 'cd /opt/kotobaseed && docker compose restart backend'
ssh root@138.199.167.136 'cd /opt/kotobaseed && docker compose restart backend'
```

If the backend fails to come up — the new value is wrong. Roll back the
.env edit (you have it in the password manager) and restart again.

---

## 1 · Stripe — secret + webhook signing (highest priority)

### 1a. Stripe secret API key

1. Log into **dashboard.stripe.com** as the Sophia-AFM account.
2. Top right → **Developers → API keys**.
3. Confirm you're on **Live mode** (toggle top right).
4. Under **Standard keys → Secret key** → click **Roll key** (NOT reveal).
5. Stripe prompts for a confirmation — confirm. New key shown ONCE.
6. Copy the new `sk_live_...` value into your password manager.

Paste on each server:

```bash
ssh root@167.233.29.52 'nano /opt/kotobaseed/.env'
# Find STRIPE_SECRET_KEY=, replace value, save (Ctrl+O, Enter, Ctrl+X)

ssh root@138.199.167.136 'nano /opt/kotobaseed/.env'
# Same line, paste the same key
```

Restart the backend on both servers (see "Before you start").

Smoke test: visit a tutor page on `demo.kotobaseed.net`, click a paid
lesson pack, walk into Stripe Checkout. The page renders → key works.
Don't actually complete the test purchase — the goal is to confirm
Stripe accepted the new key for the session-create call.

### 1b. Stripe webhook signing secret

Two webhook endpoints exist: `pledges/webhook` and
`subscriptions/webhook`. Both have their own signing secrets.

1. In Stripe dashboard → **Developers → Webhooks**.
2. Click the endpoint for `https://api.kotobaseed.net/pledges/webhook`.
3. **Signing secret** → **Roll secret** → confirm.
4. Copy the new `whsec_...` value into your password manager.
5. Repeat for the `subscriptions/webhook` endpoint.

Paste on each server:

```bash
# Same nano flow as above. Find and replace:
#   STRIPE_WEBHOOK_SECRET=
#   STRIPE_SUBSCRIPTIONS_WEBHOOK_SECRET=
```

Restart backend on both.

Smoke test: in Stripe → Webhooks → the endpoint → **Send test event** →
pick `payment_intent.succeeded`. The endpoint should return 200 within
a second. A 400 means the signing secret is wrong.

---

## 2 · Resend — transactional email

1. Log into **resend.com**.
2. **API Keys** → find the existing one named `kotobaseed-prod` (or similar).
3. **Roll** → confirm. Copy the new `re_...` value into the password manager.

Paste on each server: replace `RESEND_API_KEY=` in both .env files.

Smoke test: trigger a real transactional email — the easiest path is
to request a password reset on `demo.kotobaseed.net/forgot-password`
with a real address. Email should arrive within a minute. If it
doesn't, check Resend → Logs for a 401.

---

## 3 · Cloudflare DNS token

1. Log into **cloudflare.com → My Profile → API Tokens**.
2. Find the existing token named `kotobaseed-dns` (or similar).
3. **Roll** → confirm. Copy the new `cfut_...` value.

Paste on each server: replace `CLOUDFLARE_API_TOKEN=`.

Smoke test: this token is only used by the custom-domain provisioning
flow. We can confirm it's healthy without burning a test domain:

```bash
ssh root@167.233.29.52 \
  'curl -s -H "Authorization: Bearer $(grep CLOUDFLARE_API_TOKEN /opt/kotobaseed/.env | cut -d= -f2)" https://api.cloudflare.com/client/v4/user/tokens/verify | python3 -m json.tool'
```

Look for `"status": "active"` in the response.

---

## 4 · Daily.co (classroom video)

1. Log into **daily.co → Developer**.
2. **API Keys** → roll. Copy new value.

Paste on each server: `DAILY_API_KEY=`.

Smoke test: as a demo tutor with a booked lesson, join the classroom.
The room provisions and your video appears → key works.

---

## 5 · Telegram (admin notifications, optional)

If you don't use Telegram alerts you can skip this — but if `TELEGRAM_BOT_TOKEN`
appears in your .env, rotate it.

1. Open Telegram → message **@BotFather**.
2. `/mybots` → pick the kotobaseed alert bot.
3. **API Token → Revoke current token**. New token shown.

Paste on each server: `TELEGRAM_BOT_TOKEN=`.

Smoke test: trigger an alert path — e.g. ssh into the server, run
`docker compose exec backend python -c "from backend.services import telegram; telegram.send_admin_alert('rotation smoke test')"`.
The bot should DM you in Telegram within ~30s.

---

## 6 · Admin password

The admin user (`sophia@kotobaseed.net` or wherever the auto-seeded
account is) has a password set on first boot. Change it now.

1. On either server, run:
   ```bash
   ssh root@167.233.29.52 'cd /opt/kotobaseed && docker compose exec backend python -c "
   import secrets
   print(secrets.token_urlsafe(24))
   "'
   ```
2. Copy the printed value into the password manager.
3. Sign into `https://kotobaseed.net/login` as admin (use the current
   password from your password manager).
4. Go to your account settings → change password → paste the new one.
5. Sign out. Sign back in with the new password to confirm.

The .env's `ADMIN_PASSWORD_INITIAL` (or similar) is only used on
first-time seed and doesn't need updating — it's effectively dead
once the admin row exists.

---

## 7 · R2 (Cloudflare object storage) access keys

R2 keys cover offsite backup uploads + R2-hosted images (avatars, page
images). Rotation is a two-step dance because we can't atomically swap.

1. Cloudflare dashboard → **R2 → Manage R2 API Tokens**.
2. **Create API Token** with the same permissions as the existing one
   (Object Read & Write on the `kotobaseed-backups` bucket + any media
   bucket in use). Note the new Access Key ID + Secret Access Key.
3. **Replace** in both .env files:
   ```
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   ```
4. Restart backend on both servers.
5. Smoke test: run the backup-to-R2 job manually:
   ```bash
   ssh root@167.233.29.52 'cd /opt/kotobaseed && docker compose exec backend python -c "
   from backend.services import backup_r2 as br
   br.upload_latest_backup()
   "'
   ```
   The R2 dashboard should show a new object within a minute.
6. Once smoke is green, **delete the old token** in the Cloudflare R2 UI.

---

## 8 · Sentry tokens (if configured)

If `SENTRY_AUTH_TOKEN` is in the GitHub Actions secrets, rotate it too
for the release-tracking integration. It's read-only-ish (project releases
+ events) so blast radius is small.

1. Sentry → **Settings → Auth Tokens**.
2. Create a new token with the `project:releases` scope.
3. GitHub repo → **Settings → Secrets and variables → Actions → repository
   secrets** → edit `SENTRY_AUTH_TOKEN` with the new value.
4. Delete the old token in Sentry.

No backend restart needed — only CI uses this.

---

## After everything

1. Confirm the password manager has every new value, **labelled with
   today's date**, and the old values are deleted from there.
2. Walk `PRE_DEPLOY_CHECKLIST.md §A · Smoke` on both staging and prod.
3. Watch the Sentry dashboard for ~10 minutes after each restart — a
   spike of `KeyError: 'STRIPE_SECRET_KEY'` or `401 Unauthorized` style
   errors means a key didn't make it onto a server. Roll back the
   affected key from the password manager and retry.
4. If anything looks weird, the `/opt/kotobaseed/.env` you edited is
   the source of truth — re-verify each line against the password
   manager.

Rotate quarterly going forward — schedule a recurring reminder.
