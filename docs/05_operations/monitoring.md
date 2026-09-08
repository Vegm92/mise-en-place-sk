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
- Readiness banner on `/admin` and `/admin/health` — the three go-live gates
  (DB role scoped, migrations applied, worker alive) plus in-flight
  extractions, errors in 24 h, dead letters and pending access requests
  (`docs/05_operations/go_live_checklist.md`).
- System health: worker heartbeat (alive / stale / unknown, heartbeat age,
  release, and the worker's own env gaps), extraction queue depth + oldest
  queued item, extraction success rate and p50/p95 queue→result latency
  over 24 h, pg-boss failure rate, Stripe webhook freshness, reachability
  of Gemini / Stripe / Resend / WhatsApp Cloud, job queues + dead-letter
  counts (with retry-all for stalled items), and the per-tenant
  scheduled-job fan-out — last dispatch per job
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
| Route latency | `metric_samples` where `name = 'route.latency_ms'`, `label` = the SvelteKit route id. Bucketed per 60 s flush in the web process (`src/lib/server/metrics.ts`) — count/sum/min/max, no exact percentiles |
| `extract-invoice` depth over time | `metric_samples` where `name = 'queue.depth'` (`label` `extract-invoice`, and `extract-invoice:pgboss` for the job table) plus `queue.oldest_seconds`. Sampled every 5 min by `scheduled-metric-sample` |
| Extraction end-to-end latency | `batch_items.extracted_at - queued_at` on the row; `extractionStats()` reports p50/p95 over it. Covers failures too, unlike the extraction_results join it replaced |
| Gemini call latency | `llm_usage_log.duration_ms`, written by `recordLlmUsage` for every caller (the provider times its own call) |
| Worker up? | `worker_heartbeats.last_seen_at` — stale > 2 min means down or wedged, whatever the queue depth says |
| Extractions stalled | `batch_items` in `queued`/`extracting` with `queued_at` older than 15 min; the web process reaps these to `failed` / `extract.err.stalled` on the next batch read |
| Review backlog | `batch_items` still in `done` — nothing reaps or reminds about them, so this is the only signal that an extracted document was paid for and never looked at. `reviewBacklog()` (`src/lib/server/pipeline-stats.ts`) reports the count, the tenants, the oldest age and how much is past 168 h; surfaced as the *Review backlog* check on `/admin/health` |
| Invoice save correctness | duplicate `contentHash` hits (should be ~0); idempotency claims expired |
| LLM usage vs quota | `llm_usage_log` / `monthly_usage` (chat and digest write to `llm_usage_log` via `recordLlmUsage` — `caller_context` `chat` / `weekly-digest`, per `docs/04_engineering/llm_usage_metering.md`; the per-tenant cost cap, `checkExtractionQuota`, still runs only on the extraction path, so chat/digest spend is recorded but not enforced) |
| Webhook throughput | `idempotency_keys` grouped by `scope` |
| MV freshness | last `refresh_analytics_rollups` run (nightly cron) |
| Scheduled emails actually sent | `pgboss.job` for `tenant-weekly-digest` / `tenant-overdue-reminder` / `tenant-trial-notice`: state counts and `output->>'sent'`; last dispatch in `app_flags` (`job_run:*`) |
| Revenue | `mrr_snapshots` (15 2 * * * UTC) |

## Alerting / thresholds (as implemented)

- In-app alert types (price shock ≥15%, low stock <3 days, budget 80%/100%)
  are user-facing features, not ops alerts.
- **Review backlog** (`/admin/health` → *Review backlog*, issue #1011). Warn
  when the oldest unreviewed `done` item passes **72 h**, error past **168 h**.
  Not a Sentry alert: a tenant who stops reviewing is a churn signal, not an
  incident, and the operator sees it on the same page as the rest. Nothing
  auto-expires a `done` item — silently discarding a document the user paid to
  extract would be worse than leaving it waiting.
- Ops alerts: Sentry errors, dead-letter growth, WhatsApp account events of
  severity RED/YELLOW, failed per-tenant scheduled jobs (`/admin/health` warns
  above 0, errors above 10 in 24 h).
- **Dead-letter growth.** `scheduled-dead-letter-alert` (`5 * * * *` UTC,
  `runDeadLetterAlertJob` in `src/lib/server/alerts.ts`) counts *pending* rows
  last seen in the trailing 24 h and captures a Sentry event when it crosses a
  threshold. Two thresholds:

  | Rule | Threshold | Sentry level · fingerprint |
  |---|---|---|
  | Any queue | **> 10** distinct pending rows / 24 h | `warning` · `dead-letter-threshold` |
  | `account-cleanup` | **> 0** | `error` · `dead-letter-zeroTolerance` |

  The 10 is the same figure used for failed scheduled jobs above, deliberately —
  one number for ops to remember. It is a count of *distinct* failures, not
  retries: rows collapse on `(queue, source_id, error_class, status)` with an
  `occurrences` counter (`dead-letter.ts`), so a repeating failure is one row.
  `account-cleanup` gets its own rule because it is the GDPR deletion job: one
  dead-lettered row means a user who asked to be forgotten has not been, and
  nothing else in the system is counting down on that.

  Set a Sentry alert rule on each fingerprint. The stable fingerprints mean a
  queue that stays over the line updates one issue rather than opening one an
  hour.
- **Replaying a dead letter.** `/admin/dead-letters` offers Replay for
  `extract-invoice`, `normalize-product`, `categorize-product` and
  `whatsapp-notify`. `whatsapp-inbound` and `account-cleanup` show *No replay*
  with the reason on hover: the stored payload is redacted before it is written
  (`redactPayload` — emails masked, strings cut at 512 chars, arrays capped at
  25 items), so replaying either would run a job with quietly different data.
  For those two, re-run the work from its own tooling. The two product queues
  re-read the product name from `products` rather than trusting the redacted
  copy in the payload.
- **Worker down.** The heartbeat exists (`worker_heartbeats`, stale after
  `WORKER_HEARTBEAT_STALE_MS`, default 2 min) and `workerLiveness()` renders it
  on `/admin/health` and `/api/health`. The push half lives in the **web**
  process (`src/lib/server/worker-liveness-monitor.ts`, started from
  `hooks.server.ts`): every 60 s it reads the heartbeat and captures a Sentry
  event fingerprinted `worker-heartbeat-stale` on the alive→stale transition
  (and an info event on recovery), so a Sentry alert rule on that issue is the
  page. The alarm **cannot** live in the worker — a dead process cannot report
  its own death, and every notification path in this app (`saveAlerts`, Resend
  email, the scheduled fan-out) runs *inside* the worker. Belt and braces: an
  external uptime check polling `/api/health` for
  `worker.liveness !== "alive"` — since #491, that field is behind admin auth
  or `X-Health-Token` (`HEALTH_CHECK_TOKEN`), so the checker needs one of
  those; the plain public response is `{ status }` only. The owner steps
  (token, monitor, Sentry alert rule, worker `SENTRY_DSN`, `ALWAYS` restart
  policy) are gate 3 of `docs/05_operations/go_live_checklist.md`.
- Upstash Redis optional — when absent, in-memory rate limiting is used with a
  single-instance warning (multi-instance deploy must configure Upstash).

## Runbooks available

- Troubleshooting matrix: `docs/05_operations/troubleshooting.md`.
- Incident process: `docs/05_operations/incident_response.md`.
- Deploy-specific failures: `DEPLOYMENT.md`.
- LLM usage metering: `docs/04_engineering/llm_usage_metering.md`.
