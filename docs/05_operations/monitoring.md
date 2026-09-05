---
tags: [mep, operations]
related: "[[CONTEXT]]"
---

# Monitoring

How to know the system is healthy and where to look first. Sentry is the
primary error channel; `/admin` is the operational surface; the DB + pg-boss
tables are the ground truth for jobs.

## Error tracking — Sentry

- `@sentry/sveltekit` captures app + worker exceptions; PII scrubbed via
  `sentry-scrub.ts`; console transport in non-prod, `PROD_RELEASE` naming for
  prod deploys.
- Performance traces are sampled, not error capture: `tracesSampleRate` is
  `1.0` in development and `SENTRY_TRACES_SAMPLE_RATE` (server) /
  `VITE_SENTRY_TRACES_SAMPLE_RATE` (client) in production, defaulting to `0.1`
  when unset or invalid (`src/hooks.server.ts`, `src/hooks.client.ts`). Error
  events (`handleError`, `beforeSend`) are always captured — this only trims
  the volume of performance-trace spans sent to Sentry's quota.
- Auth failures and webhook signature failures are logged, not thrown — check
  logs/Sentry for the strings.
- **Deliberately loud paths** (do not silence): unknown Stripe price id
  (falls back `starter` + Sentry), WhatsApp number-health drops, dead-letter
  job enqueues.

## Operational surface — `/admin`

Owner-email gated. Provides:
- System health: worker heartbeat (alive / stale / unknown, with
  `last_job_completed_at`), job queues + dead-letter counts, and the
  per-tenant scheduled-job fan-out — last dispatch per job
  (`scanned / considered / dispatched`) plus a 24 h per-queue roll-up of
  done / sent / pending / failed (#518).
- `events`: `trackEvent` feed (chat, uploads, digests, billing lifecycle,
  notifications by type).
- Revenue dashboard: MRR snapshots (from `mrr_snapshots`).
- WhatsApp number health (`getNumberHealth` — worst severity in 30 days).
- Sentry/redis/env sanity info where wired.

## Data-plane checks (SQL / dashboards)

| Concern | Check |
|---|---|
| Extractions pending | `batch_items` status counts; `extract-invoice` queue |
| Worker up? | `worker_heartbeats.last_seen_at` — stale > 2 min means down or wedged, whatever the queue depth says |
| Extractions stalled | `batch_items` in `queued`/`extracting` with `queued_at` older than 15 min; the web process reaps these to `failed` / `extract.err.stalled` on the next batch read |
| Invoice save correctness | duplicate `contentHash` hits (should be ~0); idempotency claims expired |
| LLM usage vs quota | `llm_usage_log` / `monthly_usage` (note: chat + digest call Gemini directly and are **not** metered — open gap; fix contract in `docs/04_engineering/llm_usage_metering.md`) |
| Webhook throughput | `idempotency_keys` grouped by `scope` |
| MV freshness | last `refresh_analytics_rollups` run (nightly cron) |
| Scheduled emails actually sent | `pgboss.job` for `tenant-weekly-digest` / `tenant-overdue-reminder` / `tenant-trial-notice`: state counts and `output->>'sent'`; last dispatch in `app_flags` (`job_run:*`) |
| Revenue | `mrr_snapshots` (15 2 * * * UTC) |

## Alerting / thresholds (as implemented)

- In-app alert types (price shock ≥15%, low stock <3 days, budget 80%/100%)
  are user-facing features, not ops alerts.
- Ops alerts: Sentry errors, dead-letter growth, WhatsApp account events of
  severity RED/YELLOW, failed per-tenant scheduled jobs (`/admin/health` warns
  above 0, errors above 10 in 24 h).
- **Worker down is surfaced, not alerted — open gap.** The heartbeat exists
  (`worker_heartbeats`, stale after `WORKER_HEARTBEAT_STALE_MS`, default 2 min)
  and `workerLiveness()` renders it on `/admin/health` and `/api/health`, but
  nothing pushes when it goes stale: someone has to look. A stopped worker is
  therefore invisible until a symptom shows up (uploads stalling, a digest that
  never arrived, stale materialized views).
  The alarm **cannot** live in the worker — a dead process cannot report its own
  death, and every notification path in this app (`saveAlerts`, Resend email,
  the scheduled fan-out) runs *inside* the worker. Closing this needs something
  outside it: a Railway alert on the service, or an external uptime check
  polling `/api/health` for `worker.liveness !== "alive"` — since #491, that
  field is behind admin auth or `X-Health-Token` (`HEALTH_CHECK_TOKEN`), so the
  checker needs one of those; the plain public response is `{ status }` only.
  The owner steps (token, monitor, worker `SENTRY_DSN`, `ALWAYS` restart
  policy) are gate 3 of `docs/05_operations/go_live_checklist.md`.
- Upstash Redis optional — when absent, in-memory rate limiting is used with a
  single-instance warning (multi-instance deploy must configure Upstash).

## Runbooks available

- Troubleshooting matrix: `docs/05_operations/troubleshooting.md`.
- Incident process: `docs/05_operations/incident_response.md`.
- Deploy-specific failures: `DEPLOYMENT.md`.
- LLM cost accounting gap: `docs/04_engineering/llm_usage_metering.md`.
