# Claude — guardrails for this repo

This file is read by Claude on every session. Keep it short and load-bearing.

## The one-way rule (post 2026-06-21)

**Kotobaseed is live with paying tutors.** Vasso, Dafni, and Mary are on
the LIVE Stripe account. Treat prod (`167.233.29.52`, `kotobaseed.net`)
as production: changes do not go there directly.

Every change ships in this order:

1. **Staging first.** Push to `main` → GitHub Actions `deploy-staging.yml`
   auto-deploys to `138.199.167.136` (`demo.kotobaseed.net`). Or use the
   `tar-over-SSH` recipe in `DEPLOYMENT.md §Re-deploying` if you must
   bypass CI (rare — declare why).
2. **Soak.** ≥24h on staging with no regression reports — *unless* the
   change is a declared hotfix (broken payments, security exposure,
   incident). Hotfix exceptions are written into the commit message
   and the PR description so future-you can audit them.
3. **Schedule the prod window.** Pick a low-traffic slot
   (Tuesday/Wednesday 06:00–07:00 Athens is the current default).
   Post a maintenance banner ≥12h ahead via the admin maintenance
   feature so tutors see "scheduled downtime at 06:00 tomorrow"
   when they sign in.
4. **Tag and deploy.** `git tag vX.Y.Z && git push origin vX.Y.Z` →
   `deploy-prod.yml` waits for the `production` GitHub Environment
   approval; Sophia clicks "Review deployments → Approve and deploy."
5. **Smoke + drop banner.** The workflow's smoke step covers the
   golden paths. Manually walk the touched flows. Drop the maintenance
   banner. If something broke, see the rollback section in
   `DEPLOYMENT.md`.

**Do not** `ssh root@167.233.29.52 && docker compose up …` to ship code.
The only acceptable direct-to-prod operations are read-only diagnosis,
config tweaks to `.env` that are about to be backported into the repo,
or container restarts inside an incident.

## Servers + access

| Role    | IP                | Hostname     | URL                                |
|---------|-------------------|--------------|------------------------------------|
| Prod    | `167.233.29.52`   | `kotobaseed` | `https://kotobaseed.net`           |
| Staging | `138.199.167.136` | `kotoba-stage` | `https://demo.kotobaseed.net`    |

- SSH key on Sophia's laptop: `~/.ssh/sakurastudios`
- Project root on both servers: `/opt/kotobaseed`
- Stack: docker compose (postgres + redis + backend + frontend + caddy)

`PLATFORM_APEX` is build-specific: prod = `kotobaseed.net`, staging =
`demo.kotobaseed.net`. See `memory/feedback_platform_apex_templating.md`
for the gotcha — don't template `demo.${PLATFORM_APEX}`.

## Where everything lives (deep dives)

- **`DEPLOYMENT.md`** — first-time provisioning, re-deploy recipes,
  CI/CD workflow reference, rollback playbook.
- **`OPERATIONS.md`** — daily/weekly health checks, incident response,
  backup restore drill, secret rotation, custom-domain ops.
- **`memory/MEMORY.md`** — Claude's persistent project memory. The
  load-bearing decisions, gotchas, and history live here.

## Quick reflexes

- Need to deploy? → `DEPLOYMENT.md §Re-deploying` or `git push`.
- Need to fix prod NOW? → `OPERATIONS.md §5 Incident response`.
- Rotating a secret? → `OPERATIONS.md §7`.
- Touching billing or payments? → read `memory/project_stripe_live_2026_06_09.md` first.
- Touching a tutor's bespoke theme? → owner lock holds. See
  `memory/project_dafni_theme_resume.md` and the equivalent for Vasso/Mary.
