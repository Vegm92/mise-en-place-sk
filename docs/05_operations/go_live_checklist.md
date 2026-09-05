---
tags: [mep, operations]
related: "[[CONTEXT]]"
---

# Go-live checklist — Railway production

One list, three hard gates, then the service/env audit and the smoke pass.
Nothing below changes Railway on its own: every "owner" row is a dashboard or
`psql` action the founder takes. State of each row was read from the live
Railway project on 2026-09-05 (`get-service-config`, names only — no values).

`/admin` and `/admin/health` are the readiness cockpit: the banner chips are the
three gates (`Worker`, `Migrations`, `DB role`) plus in-flight extractions,
errors in 24 h, dead letters and pending access; the checks table on
`/admin/health` carries the detail (worker env gaps, queue depth, extraction
success and p50/p95, job failure rate, Stripe webhook freshness, Gemini /
Stripe / Resend / WhatsApp reachability, web env gaps). "Can this take traffic
now?" is answered by that banner being green.

## Gate 1 — runtime-role cutover (#464 → activates RLS, ADR-030)

Today both services connect as the Postgres **owner** role: `DATABASE_URL` on
web and worker is Railway's owner connection, `DATABASE_MIGRATION_URL` is not
set anywhere. RLS policies exist but are inert (owner bypasses them).

| # | Step | Who | Done when |
|---|---|---|---|
| 1.1 | Run `scripts/create-runtime-role.sql` against `DATABASE_PUBLIC_URL` with `RUNTIME_ROLE_PASSWORD` set (idempotent; also grants read on the `drizzle` ledger for gate 2) | owner | script prints `mep_runtime` with no super/createdb/createrole/bypassrls bits; `pgboss` owned by `mep_runtime`, `public` not |
| 1.2 | Web service: `DATABASE_MIGRATION_URL` = current owner URL; `DATABASE_URL` = `mep_runtime` URL (same host/port/db) | owner | both names appear on the web service |
| 1.3 | Worker service: `DATABASE_URL` = `mep_runtime` URL. Do **not** add `DATABASE_MIGRATION_URL` there — the worker no longer runs migrations | owner | only `DATABASE_URL` changed on the worker |
| 1.4 | Verify with `psql "$RUNTIME_URL"`: DML works with `app.admin`, `CREATE TABLE` and `ALTER TABLE` refused, unscoped `SELECT count(*) FROM invoices` returns 0, scoped returns the tenant's rows (DEPLOYMENT.md § Runtime vs. migration roles, steps 3–4) | owner | four psql results as documented |
| 1.5 | Redeploy both services, open `/admin/health` | owner | `DB role` check reads `mep_runtime · not table owner · RLS active` |

Rollback: point `DATABASE_URL` back at the owner URL (both services), redeploy.
Never disable RLS or drop policies as an incident response.

## Gate 2 — migration chain (journal == ledger)

`drizzle/meta/_journal.json` is what this build expects; `drizzle.__drizzle_migrations`
is what the database has. drizzle-kit applies a migration only when its journal
`when` is newer than the newest applied `created_at`, so a renumbered or
back-dated entry is skipped silently — the check reports that as **SKIPPED**,
not pending.

| # | Step | Who | Done when |
|---|---|---|---|
| 2.1 | `railway.json` (web): `preDeployCommand: pnpm db:migrate` — the only place migrations run | repo ✔ | — |
| 2.2 | `railway.worker.json` (worker): `preDeployCommand: node build/wait-for-migrations.js` — waits (≤10 min, `MIGRATION_WAIT_TIMEOUT_MS`) until every journal entry is applied, so the old worker keeps running until the schema the new build needs exists; exits non-zero on a SKIPPED entry | repo ✔ | — |
| 2.3 | CI: `pnpm db:check-sync` green on the release commit (schema.ts ↔ drizzle/) | CI | — |
| 2.4 | `/admin/health` → `Migrations` check | owner | `76/76 applied · last 0075_solid_blacklash` (or the current tail), no pending, no SKIPPED, no drift |
| 2.5 | Postgres image is `postgres-ssl:18`; CI runs `postgres:17`. Align CI to 18 or pin prod to 17 so migrations are exercised on the version they run on | owner / repo | versions match |

## Gate 3 — worker heartbeat (P0 #781)

The worker writes `worker_heartbeats` every 30 s (`WORKER_HEARTBEAT_INTERVAL_MS`);
web calls it down after 120 s (`WORKER_HEARTBEAT_STALE_MS`). Nothing inside the
app can page anyone when it stops — the alarm has to live outside the worker.

| # | Step | Who | Done when |
|---|---|---|---|
| 3.1 | After deploy, `/admin/health` → `Worker heartbeat` | owner | `Alive · last seen <2 min ago` and `Extraction queue` shows no stalled items |
| 3.2 | `railway.worker.json`: `restartPolicyType: ALWAYS` (was `ON_FAILURE` × 10 — ten crashes during a Postgres maintenance window left the worker permanently down) | repo ✔ | — |
| 3.3 | Set `HEALTH_CHECK_TOKEN` on the **web** service; point an external monitor (Railway alert, UptimeRobot, Better Stack…) at `GET /api/health` with header `X-Health-Token`, alerting when `worker.liveness != "alive"` or HTTP ≠ 200, check every 2–5 min | owner | a test alert fires when the worker service is paused |
| 3.4 | Set `SENTRY_DSN` on the **worker** service (missing today — worker exceptions currently go nowhere) and a Sentry alert rule (email/Slack) on the `Worker heartbeat stale` issue the **web** process raises every 60 s on the alive→stale transition (`src/lib/server/worker-liveness-monitor.ts`) | owner | pausing the worker for 3 min produces the Sentry issue and the alert |

## Service configuration (live vs. repo)

| Setting | Web (`mise_en_place_sk-PF`) | Worker | Action |
|---|---|---|---|
| Builder | `railway.json` → Dockerfile (dashboard shows RAILPACK; config-as-code wins) | `railway.worker.json` → Dockerfile | confirm the deployment's *Config* tab shows `DOCKERFILE` |
| Healthcheck | `/api/health`, 300 s (added — Railway keeps the previous deployment serving until this returns 200) | none (no HTTP port; supervised by restart policy + heartbeat) | — |
| Pre-deploy | `pnpm db:migrate` | `node build/wait-for-migrations.js` (was a second `pnpm db:migrate` racing the web's — drizzle takes no lock, and after gate 1 the worker's role cannot run DDL at all) | — |
| Restart policy | `ON_FAILURE` × 10 | `ALWAYS` | — |
| Replicas | 1 | 1 | keep at 1 until `UPSTASH_REDIS_REST_*` is set (in-memory rate limiter + extraction semaphore are per-process) |
| Sleep | dashboard `sleepApplication: true`, `railway.json` says `false` | not set | verify the effective value is **off** — a slept web tier drops the first request after idle |
| Region | `asia-southeast1` (all three services, including Postgres) | `asia-southeast1` | **owner:** move all three to `europe-west4` — EU tenant data at rest and ~250 ms RTT per request from Spain; Postgres needs a volume migration, do it before the first paying tenant |
| Postgres public TCP proxy | port 5432 open | — | needed for 1.1; after cutover restrict or remove (owner) |
| Custom domain | `mise-place.com` → port 8080; adapter-node listens on `PORT` | — | confirm both `mise-place.com` and the `*.up.railway.app` domain serve the app after deploy |
| Railway config cutoff (#740) | `railway.json` | `railway.worker.json` | deadline 2026-12-01 — migrate to Railway IaC or confirm config-as-code stays supported |

## Environment variables per service

Legend: ✔ set · ✖ missing · ~ set but unread by the code (safe to delete).
Boot-time enforcement is thin (`assertProductionEnv` checks only `AUTH_SECRET`,
`DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`
on the web; the worker checks nothing but `DATABASE_URL`), so this table, and
the `Env` rows on `/admin/health`, are the real gate.

### Web

| Variable | State | Note |
|---|---|---|
| `DATABASE_URL` | ✔ | owner role until gate 1 |
| `DATABASE_MIGRATION_URL` | ✖ | gate 1.2 |
| `DATABASE_SSL_MODE` | ✔ | `require`; `verify-full` is #523 |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET` | ✔ | |
| `AUTH_ADMIN_EMAIL/PASSWORD/RESTAURANT_NAME` | ✔ | |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | ✔ | |
| `STORAGE_DRIVER` + `AWS_*` (6) | ✔ | `railway` |
| `ADDRESS_HEADER`, `XFF_DEPTH` | ✔ | Railway edge rewrites XFF |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*` (3) | ✔ | |
| `STRIPE_FOUNDER_COUPON_ID`, `STRIPE_FOUNDER_PROMO_CODE` | ✔ | |
| `PLAN_PRICE_*_EUR` (3) | ✔ | `/admin/revenue` |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✔ | |
| `APP_BASE_URL` | ✔ | |
| `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | ✔ | |
| `SENTRY_RELEASE`, `VITE_SENTRY_RELEASE` | ✖ | set both to `${{RAILWAY_GIT_COMMIT_SHA}}` — without them Sentry cannot bisect to a deploy; `VITE_` one is a build arg (Dockerfile `ARG`) |
| `HEALTH_CHECK_TOKEN` | ✖ | gate 3.3 |
| `UPSTASH_REDIS_REST_URL/TOKEN` | ✖ | only before scaling past 1 replica |
| `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY` | ✖ | optional; set both or neither |
| `WHATSAPP_*` (Cloud API) | ✖ | intentionally off until Meta registration (ADR-025) |
| `COMPANY_LEGAL_NAME/ADDRESS/NIF` | ✖ | email legal footer — set once the SL exists (#779) |
| `CHAT_RATE_LIMIT_RPM`, `MAX_CONCURRENT_EXTRACTIONS`, `UPLOADS_DIR` | ✔ | |
| `STORAGE_BUCKET`, `STRIPE_PORTAL_CONFIG_ID`, `SK_SESSIONS_DIR`, `resend._domainkey` | ~ | not read anywhere in `src/`; delete |

### Worker

| Variable | State | Note |
|---|---|---|
| `DATABASE_URL`, `DATABASE_SSL_MODE` | ✔ | `mep_runtime` after gate 1.3 |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `MAX_CONCURRENT_EXTRACTIONS` | ✔ | |
| `STORAGE_DRIVER` + `AWS_*` (6) | ✔ | same bucket as web |
| `SENTRY_DSN` | ✖ | **gate 3.4** — every worker exception is invisible today |
| `SENTRY_RELEASE` | ✖ | `${{RAILWAY_GIT_COMMIT_SHA}}` |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✖ | weekly digest, overdue reminders and trial notices are sent **from the worker**; unset, `sendEmail()` logs a no-op and nothing is delivered |
| `APP_BASE_URL` | ✖ | links inside those emails and WhatsApp replies fall back to relative paths |
| `STRIPE_SECRET_KEY` | ✖ | the scheduled orphan-subscriptions reconciliation throws `Stripe not configured` on every run and dead-letters |
| `WHATSAPP_BOT_ENABLED` | ✖ | Baileys transport off — confirm intended; `/admin/whatsapp` shows disconnected until set |
| `WORKER_HEARTBEAT_*`, `SCHEDULED_FANOUT_CONCURRENCY` | defaults | |
| `AUTH_ADMIN_*`, `ADDRESS_HEADER`, `XFF_DEPTH`, `CHAT_RATE_LIMIT_RPM`, `UPLOADS_DIR` | ~ | harmless, unused by the worker |

## Smoke pass after the gates (P1 #785)

Run once on production with live keys, in this order, and keep `/admin/health`
open in a second tab:

1. Login (credentials + Google), signup → verification email arrives (Resend on web).
2. Upload a phone photo and a Facturae XML → both reach `done` on `/batch/[id]`
   within 2 min; `Worker heartbeat` stays alive; `Extraction` p95 on `/admin/health` is populated.
3. Review and save → invoice on `/invoices`; correction recorded on `/admin/learning`.
4. Stripe test checkout → `subscriptions` row updated; `Stripe webhook` on `/admin/health` shows a fresh event.
5. Force a failure (upload a corrupt file) → dead letter appears on `/admin/dead-letters`; retry works.
6. Trigger the weekly digest manually (`/digest`) → email delivered from the **worker** (needs the worker env rows above).
7. Pause the worker service for 3 min → `/admin/health` goes red, the external monitor (gate 3.3) fires; resume → green within 1 min, stalled items retried.

## Rollback levers

| Symptom | Lever |
|---|---|
| RLS refuses a legitimate query after gate 1 | `DATABASE_URL` back to the owner URL on both services; fix the missing `runAsSystem()` forward |
| Migration failed in web pre-deploy | previous deployment keeps serving; worker pre-deploy waits then times out (old worker keeps running); fix forward, never hand-edit the ledger |
| Worker crash-looping | `ALWAYS` keeps retrying; read the worker log, fix env, redeploy |
| Web healthcheck never 200 | previous deployment keeps serving; `GET /api/health` returns 503 only when the DB is unreachable |
