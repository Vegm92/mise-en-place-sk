# Monitoring

How to know the system is healthy and where to look first. Sentry is the
primary error channel; `/admin` is the operational surface; the DB + pg-boss
tables are the ground truth for jobs.

## Error tracking — Sentry

- `@sentry/sveltekit` captures app + worker exceptions; PII scrubbed via
  `sentry-scrub.ts`; console transport in non-prod, `PROD_RELEASE` naming for
  prod deploys.
- Auth failures and webhook signature failures are logged, not thrown — check
  logs/Sentry for the strings.
- **Deliberately loud paths** (do not silence): unknown Stripe price id
  (falls back `starter` + Sentry), WhatsApp number-health drops, dead-letter
  job enqueues.

## Operational surface — `/admin`

Owner-email gated. Provides:
- System health: worker heartbeat (alive / stale / unknown, with
  `last_job_completed_at`), job queues + dead-letter counts.
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
| Revenue | `mrr_snapshots` (15 2 * * * UTC) |

## Alerting / thresholds (as implemented)

- In-app alert types (price shock ≥15%, low stock <3 days, budget 80%/100%)
  are user-facing features, not ops alerts.
- Ops alerts: Sentry errors, dead-letter growth, WhatsApp account events of
  severity RED/YELLOW, worker down (stale `worker_heartbeats` row; cron misses).
- Upstash Redis optional — when absent, in-memory rate limiting is used with a
  single-instance warning (multi-instance deploy must configure Upstash).

## Runbooks available

- Troubleshooting matrix: `docs/05_operations/troubleshooting.md`.
- Incident process: `docs/05_operations/incident_response.md`.
- Deploy-specific failures: `DEPLOYMENT.md`.
- LLM cost accounting gap: `docs/04_engineering/llm_usage_metering.md`.
