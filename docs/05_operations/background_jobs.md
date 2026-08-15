# Background Jobs

All async work runs in the **separate worker process** (`pnpm worker` →
`src/worker.ts`) using pg-boss queues plus a schedule. The app never runs
scheduled jobs. Changing async behaviour must account for this process split.

## Queues (pg-boss)

| Queue | Consumer | What it does | Retries / notes |
|---|---|---|---|
| `extract-invoice` | `src/worker.ts` | Pulls an uploaded file → `extractInvoice` (classify → OCR/pages → Gemini lines → product identity) → save draft | `batchSize` = `MAX_CONCURRENT_EXTRACTIONS` (default 1); global Gemini cap via `acquireExtractionSlot()` (distributed with Redis, in-process fallback); failure → `dead-letter` sibling queue |
| `normalize-product` | `src/worker.ts` | `normalizeProductForSupplier` — canonical product upsert keyed by supplier+norm-key | Idempotent upsert |
| `*:dead-letter` | `src/worker.ts` | Rows that failed; payload redacted (secrets/emails stripped) | Inspect via `/admin` or DB |

State machine lives in `batch-core.ts` (pending → queued → extracting → done |
failed → confirmed | discarded). Enqueueing is `enqueueBatchExtraction`.

## Schedule (cron, registered in the worker — ADR-011)

| Cron (UTC) | Job | Source |
|---|---|---|
| `10 3 * * *` | `refresh_analytics_rollups()` — MV refresh (`mv_*` CONCURRENTLY) | `src/lib/server/analytics.ts` (ADR-012) |
| `0 6 * * 1` | Weekly digest emails (feature-gated tenants, deduped per week) | `src/lib/server/digest.ts` + `alerts.ts` runner |
| `15 2 * * *` | MRR snapshot (`mrr_snapshots`) for `/admin/revenue` | `revenue` module |
| daily (see worker) | Trial-expiry notices; overdue-invoice reminders | `alerts.ts` runners |
| every 2 min | Sweep in-memory rate-limit buckets | `rate-limiter.ts` (single-instance caveat) |
| `20 3 * * *` | `cleanupDeadLetters` — dead-letter retention purge | `dead-letter.ts` |
| `40 3 * * *` | `sweepIdempotencyKeys` — expire claims per scope (48 h; 96 h for `stripe-webhook`) | `idempotency.ts` (#389) |

## Invariants

- **Claim-before-do**: consumers claim with `fetch`/`UPDATE ... WHERE status` so
  two workers or a redeploy can't double-process.
- **Idempotent consumers**: extraction is re-runnable (content-hash gate
  prevents duplicate invoices); normalization upserts by key.
- **Dead-letter on failure**: unhandled job errors route to the dead-letter
  queue; payloads are redacted before landing there.
- **Startup order**: the worker runs `db:migrate` before registering jobs
  (see `DEPLOYMENT.md`); it must not run with a drifted schema.

## Operations pointers

- Check queue health: `/admin` shows worker/job status and dead-letter counts
  (`docs/05_operations/monitoring.md`).
- Testing: `tests/scheduler.test.ts` asserts job registration; per-queue
  consumers have integration tests in `tests/`.
- Changing a schedule or adding a queue is a docs event (update this file +
  the affected feature spec + CODE_NOTES).
