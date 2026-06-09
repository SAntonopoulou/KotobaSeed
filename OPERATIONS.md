# Kotobaseed — operations runbook

How to keep Kotobaseed alive once it's launched. Companion to
`DEPLOYMENT.md` (which covers initial provisioning + the deploy
mechanics) and `ARCHITECTURE.md` (system overview).

This doc assumes the servers are already up and the stack is
deploying. It answers "something happened, what do I do?" rather than
"how do I set this up?".

---

## 1. Where every secret lives

If you ever need to roll, restore, or remember a credential, this is
the index.

### Local laptop (`/home/sophia/`)

| Path | What's in it | Mode |
|---|---|---|
| `~/.ssh/sakurastudios` | SSH key for **both** prod and staging servers (root user) | 600 |
| `~/.config/koto/sentry.env` | Sentry DSNs (backend + frontend), `SENTRY_AUTH_TOKEN`, `SENTRY_MGMT_TOKEN`, org + project slugs | 600 |
| `~/.config/koto/cloudflare.env` | Cloudflare API tokens (DNS zone + management) | 600 |

Treat these three files as the source of truth. Anything else (env
files on the server, GitHub Actions secrets) is a downstream copy that
you can regenerate from these.

### On the servers (`/opt/kotobaseed/`)

| Path | What's in it |
|---|---|
| `.env` | All runtime secrets used by the backend: `SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DAILY_API_KEY`, `RESEND_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `SENTRY_BACKEND_DSN`, `ADMIN_PASSWORD`, etc. |
| `/data/database.db` | SQLite DB. Backups in `/data/backups/`. |
| `/data/backups/` | Daily SQLite snapshots from the `db_backup` APScheduler job (14-day local retention). |

The `.env` file is the only thing on the server that's not in git. If
you ever need to rebuild the server from scratch, you need to be able
to reconstruct `.env` — that's why the laptop files above matter.

### In GitHub (`SAntonopoulou/KotobaSeed`)

| Scope | Items |
|---|---|
| Repo secrets | `SENTRY_AUTH_TOKEN` |
| Repo variables | `STAGING_PATH`, `PROD_PATH`, `SENTRY_ORG`, `SENTRY_PROJECT` |
| `staging` env secrets | `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY` |
| `production` env secrets | `PROD_HOST`, `PROD_USER`, `PROD_SSH_KEY` (gated behind your manual approval) |

These are used only by the CI/CD workflows. Pre-launch, the workflows
are gated to manual trigger — they won't fire on push.

### In Cloudflare

DNS records + R2 bucket + (planned) Health Checks. Console:
`dash.cloudflare.com`. The DNS zone token in `cloudflare.env` is what
Caddy uses to renew TLS via DNS-01.

### In Stripe

Connect platform account is yours. Webhook signing secrets are in
each server's `.env`. Connected tutor accounts are owned by each
tutor — payouts go to them directly, never to you.

---

## 2. Daily / weekly health checks

Things you should glance at periodically without anything alerting you.

### Daily (30 seconds)

```bash
# Prod
ssh -i ~/.ssh/sakurastudios root@167.233.29.52 \
  "cd /opt/kotobaseed && docker compose ps && ls -lh /data/backups/ | tail -3"
```

Look for: all containers `Up`, a backup file from the last 24h.

### Weekly (5 minutes)

- **Sentry** (`sentry.io`): filter by `environment:production`, sort by
  events. Triage anything with >50 occurrences. Most prod errors will
  surface here before any user reports them.
- **Cloudflare R2**: bucket size — backups shouldn't be unbounded.
  Retention is set to 30 days on the `prune_r2_backups` job.
- **Stripe dashboard**: failed payments tab. Anything sitting in
  "requires action" for >48h needs an outreach.

---

## 3. Scaling

When traffic grows, escalate in this order. Don't skip rungs.

| Rung | What it is | When to do it |
|---|---|---|
| 1 | Bigger Hetzner box (CPX31 → CPX41 → CPX51) | Sustained CPU >70% or RAM pressure for a week |
| 2 | Add Cloudflare proxy (orange-cloud the DNS) | When CDN-able assets (images, JS, CSS) become >30% of bandwidth |
| 3 | Move SQLite → managed Postgres | When write contention shows up in Sentry as `database is locked` errors, OR when a single VPS can't keep up |
| 4 | Split backend onto its own host, add load balancer | When p95 API latency rises despite CPU headroom on the DB |
| 5 | Read replicas for Postgres | When read traffic is the bottleneck (analytics, dashboard queries) |
| 6 | Multi-region | When EU + Asia latency complaints start landing |

Rungs 1–2 are days of work. Rungs 3–6 are weeks each. **Don't pre-build for rung 6** — most apps never need it.

### Quick wins before vertical scaling

- Bump APScheduler job frequency *down* if jobs are firing wastefully.
- Cache the marketplace tutor list (it's the hottest read).
- Tune SQLite PRAGMAs (`journal_mode=WAL` is already on).

---

## 4. Backup restoration drill

You should rehearse this **once a quarter**. The whole point of
backups is that you've practiced restoring from them before the day
you need to.

### Drill on staging (safe)

```bash
ssh -i ~/.ssh/sakurastudios root@138.199.167.136
cd /opt/kotobaseed

# 1. Pick a backup
ls -lh /data/backups/ | tail -5

# 2. Stop the backend so nothing's writing
docker compose stop backend

# 3. Move the live DB aside, copy backup into place
cp /data/database.db /data/database.db.drill-aside-$(date +%s)
cp /data/backups/<BACKUP_FILENAME>.db /data/database.db
chown 1000:1000 /data/database.db  # match the container's user

# 4. Bring backend up, smoke
docker compose up -d backend
docker compose logs --since 1m backend | head -40
curl -fsS https://api.demo.kotobaseed.net/healthz

# 5. Spot-check the data: log in as the demo admin and confirm a tutor
#    + a couple of bookings look right
```

If anything fails: `cp /data/database.db.drill-aside-* /data/database.db` to roll back.

### Restoring from R2 (offsite)

If `/data/backups/` is gone too (whole disk lost):

```bash
# On any machine with the R2 creds
aws s3 ls s3://kotobaseed-backups/ --endpoint-url=$R2_ENDPOINT
aws s3 cp s3://kotobaseed-backups/<KEY> ./recovered.db \
  --endpoint-url=$R2_ENDPOINT
```

Then `scp recovered.db root@<HOST>:/data/database.db` and bring
backend up.

### R2 backup guards (don't blow the free tier)

`backend/services/db_backup.py` enforces two ceilings beyond the
date-based retention:

| Knob | Default | Behaviour |
|---|---|---|
| `R2_BACKUP_QUOTA_BYTES` | `7516192768` (7 GiB) | Before each upload, the service lists the bucket. If `bucket_size + file_size` would exceed this, the upload is skipped, a `WARNING` is logged (Sentry will pick it up), and the local backup still happens. Sized to leave 3 GB of headroom under R2's 10 GB free tier. |
| `R2_BACKUP_MAX_OBJECTS` | `60` | The prune step always keeps no more than this many objects, regardless of date-based retention. Defense in case a clock bug ever stops the date-based prune. |
| `BACKUP_RETENTION_DAYS` | `30` | Date-based retention — objects older than this are pruned. |

To check current usage at any time:

```bash
ssh -i ~/.ssh/sakurastudios root@<HOST> \
  "cd /opt/kotobaseed && docker compose exec -T backend python -c \"
from backend.services.db_backup import _r2_backup_client, _r2_bucket_size
from backend.config import settings
c = _r2_backup_client()
print(f'{_r2_bucket_size(c)/1024/1024:.2f} MiB of {settings.r2_backup_quota_bytes/1024/1024/1024:.1f} GiB quota')
\""
```

Staging does **not** ship to R2 — its `.env` doesn't have R2 creds, so
the upload path short-circuits and only local backups happen. That's
intentional: demo data isn't worth offsite storage. If you ever want
staging on R2, add the same `R2_*` block to its `.env` plus a unique
bucket (don't share the prod bucket — name collisions and pollution).

---

## 5. Incident response

Generic playbook. Tune the specifics to whatever you're seeing.

### "The site is down"

1. **Did Caddy crash?**
   ```bash
   ssh -i ~/.ssh/sakurastudios root@167.233.29.52 "cd /opt/kotobaseed && docker compose ps"
   ```
   - All `Up`? Skip to step 2.
   - Caddy is down → `docker compose restart caddy`
   - Backend is down → `docker compose logs --tail 200 backend`
2. **Backend logs say `database is locked`?** SQLite write contention. Restart backend (`docker compose restart backend`). If recurring, time to move to Postgres (rung 3).
3. **Backend logs say `OperationalError: no such column`?** A migration didn't run. See section 6.
4. **Backend logs say `RuntimeError: SECRET_KEY missing`?** `.env` was nuked. Restore from your laptop's copy.
5. **All containers up but the site shows the maintenance page?** Caddy is serving the fallback because something downstream is 5xx-ing. Check Sentry for the actual error.

### "Stripe payouts failing for a tutor"

1. Stripe dashboard → Connect → find the tutor's connected account.
2. If status is "restricted" → the tutor needs to finish onboarding. Their dashboard already has a banner; ping them too.
3. If status is "complete" but a payment failed → look at the failed-payment row, copy the failure code, search Stripe docs.

### "A user's account is broken"

Open prod admin (kotobaseed.net/admin) → Users → find them. Almost
everything user-facing is editable from there. If you need raw SQL:

```bash
docker compose exec backend python -c "
from backend.database import SessionLocal
from backend.models import User
with SessionLocal() as s:
    u = s.query(User).filter_by(email='who@example.com').one()
    print(vars(u))
"
```

### "I just deployed and everything is broken"

```bash
ssh -i ~/.ssh/sakurastudios root@167.233.29.52
cd /opt/kotobaseed
git log --oneline -5     # what just shipped
git checkout <prev_sha>  # roll back the code
docker compose up -d --build backend frontend
```

If a migration corrupted state, restore the deploy-snapshot:

```bash
ls /data/database.db.deploy-*.bak | tail -1   # most recent
cp <that file> /data/database.db
docker compose restart backend
```

---

## 6. Migrations

The pattern that keeps biting: SQLModel auto-creates tables on
startup; alembic then can't migrate "an existing table". The pattern
is:

1. Add the field to `backend/models.py`
2. Write the alembic migration (additive only — no destructive changes mid-flight)
3. Deploy
4. On the server, **after the backend has started**:
   ```bash
   docker compose exec backend alembic current
   ```
   - If `alembic current` shows the previous revision → run `docker compose exec backend alembic upgrade head` (normal path)
   - If `alembic current` shows the head already (SQLModel auto-created) → run the `ALTER TABLE` by hand and `alembic stamp head`:
     ```bash
     docker compose exec backend sqlite3 /data/database.db "ALTER TABLE foo ADD COLUMN bar TEXT;"
     docker compose exec backend alembic stamp <new_revision_id>
     ```

The recurring fix is documented in `feedback_migration_patterns.md` in
the memory store.

### Specific pending: 20260622_demo_trial_period

The monthly-trial migration hasn't been applied to staging or prod
yet. On the next deploy of either env, expect the auto-create-then-stamp
pattern:

```bash
# Add the three new columns
docker compose exec backend sqlite3 /data/database.db \
  "ALTER TABLE user ADD COLUMN demo_trial_minutes_allocated INTEGER;
   ALTER TABLE user ADD COLUMN demo_trial_period VARCHAR(16);
   ALTER TABLE user ADD COLUMN demo_trial_period_anchor DATETIME;
   UPDATE user SET demo_trial_period='total',
                   demo_trial_minutes_allocated=demo_trial_minutes_remaining
            WHERE is_demo_trial=1;"

# Stamp alembic to the new head
docker compose exec backend alembic stamp 20260622_demo_trial_period
```

---

## 7. Rolling secrets

Pick a cadence — **annually** is fine for most, **immediately** if
you suspect a token leaked. Procedure for each:

### `SECRET_KEY` (JWT signing)

Rolling this invalidates every session. Plan for it.

```bash
# Generate a new one locally
python -c "import secrets; print(secrets.token_urlsafe(48))"

# Edit /opt/kotobaseed/.env on the server, replace SECRET_KEY
# Then restart backend
docker compose restart backend
```

All users will be logged out and need to sign in again. Communicate
in advance.

### Stripe webhook signing secret

1. Stripe dashboard → Developers → Webhooks → your endpoint → **Roll secret**.
2. Stripe shows the new value once. Copy it.
3. Edit `.env` on prod, replace `STRIPE_WEBHOOK_SECRET`.
4. `docker compose restart backend`.
5. Stripe dashboard → fire a test event → confirm it's accepted (`200` in the delivery log).

### Daily.co API key

1. Daily.co dashboard → Developers → revoke old key.
2. Generate new one, paste into `.env` as `DAILY_API_KEY`.
3. `docker compose restart backend`.
4. Open the admin panel → join a test classroom session to confirm token mint works.

### Resend API key

Same shape as Daily.co. Test by triggering the password-reset email
to a throwaway address.

### Cloudflare DNS token

Caddy uses this to renew the wildcard TLS cert via DNS-01. Roll only
if it leaks — otherwise leave alone, because rolling at the wrong
moment can interrupt cert renewal.

1. Cloudflare → My profile → API Tokens → Create new token, same scopes (`Zone:Read`, `Zone:DNS:Edit`).
2. Replace `CLOUDFLARE_API_TOKEN` in `.env`.
3. `docker compose restart caddy`.
4. Wait for the next cert renewal window (Caddy renews ~30 days before expiry) and check Caddy's logs to confirm DNS-01 succeeded.

### R2 access keys

1. Cloudflare → R2 → Manage R2 API Tokens → create new, same scopes.
2. Replace `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` in `.env`.
3. `docker compose restart backend`.
4. Trigger a backup manually to confirm upload still works.

### Sentry tokens

1. Sentry → User Settings → Auth Tokens → revoke old.
2. Create new with same scopes (`project:releases` for `SENTRY_AUTH_TOKEN`, broader for `SENTRY_MGMT_TOKEN`).
3. Update `~/.config/koto/sentry.env` on your laptop **and** the GitHub Actions repo secret.
4. Trigger the next deploy to confirm source-map upload still works.

---

## 8. Quarterly chores

Things that aren't urgent but matter:

- **Backup drill** (section 4) — actually restore from a backup. Once per quarter, on staging.
- **Sentry quota review** — check the org quota usage. Bump or sample down if necessary.
- **Stripe dispute review** — look at any open disputes; reply to anything still in your court.
- **Tutor pulse** — pick three random tutors with no recent activity. Send them a friendly check-in.
- **Roll one secret** — pick one, rotate it. Builds the muscle so you can do it under pressure.

---

## 9. Reference: contacts

| Thing | Where |
|---|---|
| Hetzner control panel | `console.hetzner.cloud` |
| Cloudflare | `dash.cloudflare.com` |
| Stripe | `dashboard.stripe.com` |
| Sentry | `sentry.io` → `opa-software-ltd` org |
| Daily.co | `dashboard.daily.co` |
| Resend | `resend.com` → API Keys |
| Domain registrar (kotobaseed.net) | (wherever you bought it — record this) |
| GitHub repo | `github.com/SAntonopoulou/KotobaSeed` |

If your laptop is lost and you need to start over, you need access to
the Hetzner + Cloudflare consoles to recover. Everything else can be
rebuilt from those two.
