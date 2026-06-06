# Kotobaseed deployment

A launch-day walkthrough for putting Kotobaseed onto a Hetzner CPX31 (or any single-server VPS). Follow top to bottom on a fresh server. If you're re-deploying an existing server, jump to "Re-deploying after changes".

## 0. Before you start

You'll need accounts + credentials for:

- **Hetzner Cloud** — VPS host (CPX31 recommended: 4 vCPU, 8GB RAM, ~€11/mo)
- **Cloudflare** — DNS + wildcard certificate issuance. Add `kotobaseed.net` if it isn't already there.
- **Stripe** — platform account in live mode, Connect enabled
- **Resend** — transactional email
- **Daily.co** — classroom video (free tier is fine to start)

Generate the production secrets you'll paste later:

```bash
# JWT signing key — 64 chars of randomness
python -c "import secrets; print(secrets.token_urlsafe(48))"

# A separate strong password for the admin user
python -c "import secrets; print(secrets.token_urlsafe(24))"
```

Save both somewhere safe (1Password / Bitwarden). You'll need them in step 3.

## 1. Provision the server

1. Create a Hetzner CPX31 in your nearest data center (Helsinki is fine from anywhere in Europe).
2. Image: **Ubuntu 24.04**.
3. Add your SSH key during creation. Disable password login.
4. Note the public IPv4 — call it `<SERVER_IP>` below.

SSH in:

```bash
ssh root@<SERVER_IP>
```

Bootstrap the server:

```bash
# System updates
apt update && apt upgrade -y

# Docker + Compose
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin git

# Create a non-root deploy user (don't run prod as root)
adduser --disabled-password --gecos "" kotobaseed
usermod -aG docker kotobaseed
mkdir -p /home/kotobaseed/.ssh
cp ~/.ssh/authorized_keys /home/kotobaseed/.ssh/
chown -R kotobaseed:kotobaseed /home/kotobaseed/.ssh
chmod 600 /home/kotobaseed/.ssh/authorized_keys
```

Log out, then SSH back in as `kotobaseed`:

```bash
ssh kotobaseed@<SERVER_IP>
```

## 2. Clone the repo

```bash
mkdir -p /opt
sudo mkdir /opt/kotobaseed
sudo chown kotobaseed:kotobaseed /opt/kotobaseed
git clone <repo-url> /opt/kotobaseed
cd /opt/kotobaseed
```

## 3. Environment file

Copy the example and fill in production values:

```bash
cp .env.example .env
nano .env
```

Fields you must set (everything else has a sensible default):

```env
# --- Core ---
ENVIRONMENT=production
SECRET_KEY=<the JWT signing key you generated in step 0>
DATABASE_URL=sqlite:////data/database.db
FRONTEND_URL=https://kotobaseed.net

# --- Admin user (auto-seeded on first boot) ---
ADMIN_EMAIL=sophia@kotobaseed.net
ADMIN_PASSWORD=<the admin password from step 0>

# --- Stripe (LIVE keys — make sure the dashboard shows "live") ---
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...   # filled in during step 6

# --- Resend ---
RESEND_API_KEY=re_...
EMAIL_FROM_ADDRESS=hello@kotobaseed.net
EMAIL_FROM_NAME=Kotobaseed

# --- Daily.co ---
DAILY_API_KEY=...
DAILY_DOMAIN=kotobaseed.daily.co

# --- Custom domains ---
KOTOBASEED_SERVER_IP=<SERVER_IP>
CUSTOM_DOMAIN_AUTO_VERIFY=false   # MUST be false in prod

# --- CORS ---
CORS_ORIGINS=https://kotobaseed.net
CORS_ORIGIN_REGEX=^https://([a-z0-9-]+\.)?kotobaseed\.net$
```

Lock down the file:

```bash
chmod 600 .env
```

## 4. DNS setup (Cloudflare)

In the Cloudflare dashboard for `kotobaseed.net`:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `<SERVER_IP>` | DNS only (grey cloud) |
| A | `*` | `<SERVER_IP>` | DNS only |
| A | `api` | `<SERVER_IP>` | DNS only |

**Important**: keep all three on DNS only (grey cloud). Cloudflare proxying will fight Caddy's TLS issuance. You can move to proxied later if you want, but launch with grey cloud everywhere.

Create a scoped API token under My Profile → API Tokens:
- Permissions: `Zone → DNS → Edit`
- Zone Resources: `Include → Specific zone → kotobaseed.net`

Copy it. You'll paste it as `CLOUDFLARE_API_TOKEN` for Caddy.

Wait 2–3 minutes, then verify from your laptop:

```bash
dig +short kotobaseed.net
dig +short anything.kotobaseed.net
# Both should return <SERVER_IP>
```

## 5. Caddy + wildcard TLS

Caddy provisions the wildcard `*.kotobaseed.net` certificate via DNS-01 against Cloudflare. The project ships a `Caddyfile` at the repo root.

Set the Cloudflare token in `.env`:

```env
CLOUDFLARE_API_TOKEN=<the token from step 4>
```

Bring up the stack:

```bash
docker compose up -d --build
```

Watch the logs:

```bash
docker compose logs -f caddy
```

You should see Caddy obtain certificates for `kotobaseed.net` and `*.kotobaseed.net`. First boot takes 30–90s.

Verify:

```bash
curl -I https://kotobaseed.net
curl -I https://api.kotobaseed.net
# Both should return HTTP/2 200 (or 404 for the API root — that's also fine, the cert is what matters)
```

## 6. Stripe webhook

In the Stripe dashboard (LIVE mode):

1. Developers → Webhooks → Add endpoint
2. URL: `https://api.kotobaseed.net/pledges/webhook`
3. Events to send — subscribe to all of:
   - `checkout.session.completed`
   - `charge.refunded`
   - `account.updated`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. After creating, copy the signing secret (`whsec_...`).
5. Update `STRIPE_WEBHOOK_SECRET` in `.env`.
6. Restart backend so it picks up the new secret:
   ```bash
   docker compose restart backend
   ```

Test the webhook in the Stripe dashboard ("Send test event"). The endpoint should return `200 OK`.

## 7. Resend domain verification

1. Resend dashboard → Domains → Add domain → `kotobaseed.net`.
2. Resend gives you 3 DNS records (DKIM CNAMEs + a return-path TXT). Add each one in Cloudflare (DNS only, grey cloud).
3. Click "Verify domain" in Resend. Should turn green within a few minutes.
4. **Until verified**, transactional emails will fail silently on prod — the backend logs warnings but the cancel/booking flow still works.

## 8. First-time admin login

The backend seeds the admin user from `.env` on first boot. Verify:

```bash
docker compose logs backend | grep "admin user"
# Created default admin user sophia@kotobaseed.net
```

Visit `https://kotobaseed.net/login`, log in with the admin email + password from step 0. From there you can:
- Sign up a test tutor at `/onboarding/tutor`
- Walk through Stripe Connect onboarding with test data
- Confirm the tutor's subdomain (`testname.kotobaseed.net`) loads

## 9. Smoke test checklist

Before announcing the launch, click through:

- [ ] Apex `kotobaseed.net` loads, shows the marketing site
- [ ] Sign up flow creates a tutor + Stripe Connect onboarding link works
- [ ] Tutor subdomain renders with default Sage theme
- [ ] Pro tutor can switch themes from the dashboard Site section
- [ ] Page builder reorders sections and the public site reflects them
- [ ] Lesson booking goes through Stripe checkout end-to-end (test card `4242 4242 4242 4242`)
- [ ] Booking confirmation email arrives in the student inbox
- [ ] 24h reminder fires (manually fast-forward by setting `scheduled_at` close to now)
- [ ] Cancellation refunds via Stripe and sends the cancel email
- [ ] Custom domain (if testing) verifies and serves with TLS
- [ ] `/marketplace` lists the test tutor once they enable marketplace listing

## Re-deploying after changes

```bash
ssh kotobaseed@<SERVER_IP>
cd /opt/kotobaseed
git pull
docker compose up -d --build backend frontend
```

Migrations apply automatically on container start via `entrypoint.sh`.

If a migration looks risky, back up the SQLite DB first:

```bash
docker compose exec backend cp /data/database.db /data/database.db.$(date +%Y%m%d).bak
```

## Cron jobs (APScheduler, in-process)

The backend runs scheduled tasks via APScheduler **inside the FastAPI process**.

| Job | Schedule | What it does |
|---|---|---|
| `dormant_pause` | Daily at `DORMANT_CHECK_HOUR_UTC` (default 04:00 UTC) | Flips Starter tutors with no completed lesson in `dormant_pause_days` (default 30) to `PAUSED_DORMANT`. Idempotent. |
| `booking_reminder_sweep` | Hourly | Finds confirmed bookings ~24h out and sends reminder emails. Dedupes via `Booking.reminder_sent_at`. |

### Multi-worker safety

APScheduler runs *inside each worker*. Without protection the dormant sweep would fire once per worker. We protect via an audit-log "already ran today" check — first worker stamps it, later workers exit early. Worst case: duplicate audit rows, work itself stays idempotent.

For strict serialization, run with `UVICORN_WORKERS=1` (the default in `entrypoint.sh`).

### Verifying

```bash
docker compose logs --since 5m backend | grep -E "dormant_pause|reminder"
```

You should see one of:
- `dormant_pause sweep complete: N tutor(s) paused`
- `dormant_pause: already ran today; skipping`

### Forcing a run

```bash
docker compose exec backend python -c "from backend.services.dormant_pause import pause_dormant_tutors; pause_dormant_tutors()"
```

## Things that will bite you

- **CORS errors that look like backend crashes**: a 500 in FastAPI strips CORS headers. The browser then reports it as a CORS bug. Always curl the endpoint with `Origin:` first to see the real error.
- **SQLAlchemy enum columns are case-sensitive**: stored values must match the Python enum NAME (uppercase: `CREATOR`, `PRO`), not the string value. Don't lowercase enum-backed columns in SQL.
- **`CUSTOM_DOMAIN_AUTO_VERIFY=true` in prod**: would let anyone claim any domain. Always `false` in prod.
- **Don't commit `.env`**: `.env.example` is the prod template; the real one stays only on the server.
- **Cloudflare proxy (orange cloud) breaks Caddy's TLS issuance**: keep DNS-only at launch. Move to proxied later as a deliberate step if you want CDN.

## Handover note for future-Sophia

The Stripe + Resend + Daily.co accounts are yours under your legal entity. Tutors onboard their own Stripe Connect Express accounts; payouts go directly to them, never via Kotobaseed.
