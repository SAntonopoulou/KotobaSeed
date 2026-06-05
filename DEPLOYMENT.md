# Kotobaseed deployment notes

Working notes for putting Kotobaseed onto a Hetzner VPS (or any single-server box). The repo runs fine in a single-process model; this doc captures the parts you need to remember.

## Cron jobs (APScheduler, in-process)

The backend runs scheduled tasks via APScheduler **inside the FastAPI process**. As of Step 10b there is one job:

| Job | Schedule | What it does |
|---|---|---|
| `dormant_pause` | Daily at `settings.dormant_check_hour_utc` (default 04:00 UTC) | Flips Starter tutors with no completed lesson in `dormant_pause_days` (default 30) to `PAUSED_DORMANT`. Idempotent. Records to the audit log. |

### What you need to know for prod

1. **Set env vars**. The defaults work for prod, but you can override:
   - `SCHEDULER_ENABLED=true` (default)
   - `DORMANT_PAUSE_DAYS=30`
   - `DORMANT_CHECK_HOUR_UTC=4`

2. **Multiple uvicorn workers + APScheduler.** The current `entrypoint.sh` defaults to `UVICORN_WORKERS=2`. APScheduler runs *inside each worker*, so without protection the dormant-pause sweep would fire twice. We protect against this by checking the audit log at the start of each run — the first worker to complete a sweep stamps `tutor.dormant_sweep_completed`; later workers see that stamp and exit early. Not bulletproof against a sub-second race window (both workers see no stamp, both run), but worst case we get duplicate audit rows; the actual work stays idempotent. To get strict serialization, run with `UVICORN_WORKERS=1` for now.

3. **Verifying the cron in prod.** Tail the backend logs after 04:00 UTC:
   ```
   docker compose logs --since 5m backend | grep dormant_pause
   ```
   You should see one of:
   - `dormant_pause sweep complete: N tutor(s) paused`
   - `dormant_pause: already ran today; skipping` (from any non-first worker)

4. **Forcing a run for testing.** From a Python shell inside the backend container:
   ```python
   from backend.services.dormant_pause import pause_dormant_tutors
   pause_dormant_tutors()
   ```

### When we add more cron jobs

Each new job follows the same pattern:
- Pure-function logic in `backend/services/<job_name>.py`
- Wired in `main.py:_build_scheduler()` with a CronTrigger
- Multi-worker safety via the audit-log "already ran today" check
- Disable in tests via `SCHEDULER_ENABLED=false` (already set in `conftest.py`)

If we ever outgrow in-process scheduling we'd run a separate `cron` container with `--workers=1` and the same `apscheduler` setup, leaving the web `app` container with `--workers=N` for HTTP traffic. That's a config-only split, not a code change.

## Stripe Connect — prod webhook secret

The local dev `STRIPE_WEBHOOK_SECRET` is the stable per-project secret from `stripe listen --print-secret` (set up in `feedback_no_workarounds.md`). **Prod needs its own secret**:

1. Register a webhook endpoint in the Stripe dashboard pointing at `https://api.kotobaseed.net/pledges/webhook` (or wherever the backend is exposed).
2. Subscribe it to at least: `checkout.session.completed`, `account.updated`, `charge.refunded`.
3. Copy the signing secret (starts with `whsec_...`) into prod env as `STRIPE_WEBHOOK_SECRET`.

## Wildcard subdomain + TLS

For `*.kotobaseed.net` to route to tutor sites:
- **DNS**: one record at Cloudflare — `*.kotobaseed.net A <server-ip>` plus `kotobaseed.net A <server-ip>`.
- **TLS**: Caddy auto-provisions a wildcard cert via Let's Encrypt DNS-01 against the Cloudflare API. Requires a Cloudflare API token scoped to DNS-edits-only on `kotobaseed.net`. The token goes into Caddy's env, not the FastAPI env.
- **Custom domains** (Pro feature): Caddy can also provision per-domain certs via HTTP-01 on first request. The tutor must point their domain DNS at our server *before* configuring it on our side, or the cert request fails. Front-end will gate the "Save custom domain" button behind a DNS check.

## Things to remember

- Re-run `stripe login --project-name=kotobaseed` if the local dev key ever rotates.
- The dev `.env` has both Kotobaseed and dev-only keys — never commit it; `.env.example` is the prod template.
- After `git pull` on prod, `docker compose up -d --build backend` triggers a fresh container start which runs `entrypoint.sh` — that auto-applies any new Alembic migrations.
