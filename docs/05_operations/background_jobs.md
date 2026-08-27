# Background Jobs

All async work runs in the **separate worker process** (`pnpm worker` →
`src/worker.ts`) using pg-boss queues plus a schedule. The app never runs
scheduled jobs. Changing async behaviour must account for this process split.

## Queues (pg-boss)

| Queue | Consumer | What it does | Retries / notes |
|---|---|---|---|
| `extract-invoice` | `src/worker.ts` | Pulls an uploaded file → `extractInvoice` (classify → OCR/pages → Gemini lines → product identity) → save draft | `batchSize` = `MAX_CONCURRENT_EXTRACTIONS` (default 3, parallel up to the cap); global Gemini cap via `acquireExtractionSlot()` (distributed with Redis, in-process fallback); failure → `dead-letter` sibling queue |
| `normalize-product` | `src/worker.ts` | `normalizeProductForSupplier` — canonical product upsert keyed by supplier+norm-key | Idempotent upsert |
| `categorize-product` | `src/worker.ts` | `processCategorizeJob` — asks Gemini for one category from `VALID_CATEGORIES` for a product's canonical name and fills `products.category` (ADR-027) | `batchSize` 1, priority −10, 1 retry 60 s apart, `expireInSeconds` 900, `singletonKey` = `<rid>:<productId>`; only ever fills a NULL, so it is idempotent and never overwrites a human's choice; failure → `dead-letter` sibling queue |
| `tenant-weekly-digest` | `src/lib/server/tenant-fanout.ts` | One tenant's weekly digest — generate + email (`sendWeeklyDigest`) | Fanned out by the cron dispatcher, one job per tenant; `batchSize` = `SCHEDULED_FANOUT_CONCURRENCY` (default 5) with `perJobResults`, 2 retries 120 s apart, then dead-letter (ADR-025) |
| `tenant-overdue-reminder` | `src/lib/server/tenant-fanout.ts` | One tenant's overdue-invoice email (`sendOverdueReminder`) | Same fan-out contract |
| `tenant-trial-notice` | `src/lib/server/tenant-fanout.ts` | One tenant's trial notice at T-7 / T-1 / lapsed (`sendTrialNotice`) | Same fan-out contract |
| `whatsapp-notify` | `src/worker.ts` | `notifyWhatsAppSender` — sends the extracted-data summary (or the failure notice) back to the number that sent the invoice, and opens it for review | Registered only when a WhatsApp transport is running; `batchSize` 1; 3 retries 60 s apart, `expireInSeconds` 300, `singletonKey` = itemId; failure → `dead-letter` sibling queue |
| `*:dead-letter` | `src/worker.ts`, `tenant-fanout.ts` | Rows that failed; payload redacted (secrets/emails stripped) | Inspect via `/admin` or DB |

State machine lives in `batch.ts` (pending → queued → extracting → done |
failed → confirmed | discarded). Enqueueing is `enqueueBatchExtraction`.

## Worker liveness (#540)

`src/worker.ts` upserts the single `worker_heartbeats` row on boot, every
`WORKER_HEARTBEAT_INTERVAL_MS` (default 30 s), and after each completed job
batch — the latter also bumps `last_job_completed_at` and `jobs_completed`.
`workerLiveness()` calls the worker `stale` once the heartbeat is older than
`WORKER_HEARTBEAT_STALE_MS` (default 120 s), and `unknown` when the worker has
never run against this database. Surfaced as the `Worker heartbeat` check on
`/admin/health` and under `worker` on `/api/health`.

A queue that is not draining is only diagnosable with this: `pending > 0` plus
a live heartbeat means the worker is busy, `pending > 0` plus a stale heartbeat
means it is down or wedged.

## Stalled extractions (#540)

The web process, not the worker, owns the stall path — the worker being down is
exactly the case that has to be caught. `markQueued` stamps `queued_at`; the
`/batch/[id]` load and the `api/batch-status/[id]` poll then classify each
in-flight item:

| Age since `queued_at` | Level | Effect |
|---|---|---|
| < `EXTRACTION_STALL_WARN_MS` (2 min) | `none` | spinner, unchanged |
| ≥ warn, < timeout | `slow` | "taking longer than expected" card with Retry / Discard |
| ≥ `EXTRACTION_STALL_TIMEOUT_MS` (15 min) | `expired` | `failStalledItems` marks it `failed` / `extract.err.stalled`, inheriting the existing failure UI |

The hard timeout sits well above the worst legitimate run (pg-boss `retryLimit`
2 × `retryDelay` 30 s, each attempt bounded by `GEMINI_TIMEOUT_MS`), so a
still-working extraction is not reaped. If it were, `markDone` finds the item no
longer in `queued`/`extracting` and drops the result — the user retries rather
than seeing a silent overwrite.

WhatsApp items carry a second, independent axis in `batch_items.review_status`
(null → pending → reviewed | to_review), which records what the sender answered
rather than where extraction got to. Web uploads leave it null.

## Schedule (cron, registered in the worker — ADR-011)

All eight are registered from the `JOBS` array in `src/lib/server/alerts.ts`
(`registerScheduledJobs`); the cron strings live beside it. A job that throws is
Sentry-reported and dead-lettered, then re-thrown so pg-boss records the failure.

| Cron (UTC) | Job | Runner |
|---|---|---|
| `0 6 * * 1` | Weekly digest **dispatcher** — one `tenant-weekly-digest` job per feature-gated tenant, deduped per week | `runWeeklyDigestJob` — `alerts.ts`; the handler `sendWeeklyDigest` generates via `getOrGenerateWeeklyDigest` (`weekly-digest.ts`) |
| `30 6 * * *` | Overdue-reminder **dispatcher** — one `tenant-overdue-reminder` job per tenant | `runOverdueRemindersJob` — `alerts.ts`; handler `sendOverdueReminder` |
| `0 7 * * *` | Trial-notice **dispatcher** — one `tenant-trial-notice` job per tenant at a milestone | `runTrialNoticesJob` — `alerts.ts`; handler `sendTrialNotice` |
| `0 3 * * *` | File retention purge | `runFilePurgeJob` — `alerts.ts` |
| `15 2 * * *` | MRR snapshot (`mrr_snapshots`) for `/admin/revenue` | `runMrrSnapshotJob` — `revenue-metrics.ts` |
| `20 3 * * *` | Dead-letter retention purge | `runDeadLetterPurgeJob` — `alerts.ts` / `dead-letter.ts` |
| `10 3 * * *` | `refresh_analytics_rollups()` — MV refresh (`mv_*` CONCURRENTLY) | `runAnalyticsRefreshJob` — `alerts.ts` (ADR-012) |
| `40 3 * * *` | `sweepIdempotencyKeys` — expire claims per scope (48 h; 96 h for `stripe-webhook`) | `runIdempotencySweepJob` — `alerts.ts` / `idempotency.ts` (#389) |

Not on this schedule: `rate-limiter.ts` sweeps its in-memory buckets on its own
`setInterval` (every 2 min, per process), and `worker-heartbeat.ts` beats every
30 s the same way — neither is a pg-boss job.

## Tenant fan-out (ADR-025, [#518](https://github.com/Vegm92/mise-en-place-sk/issues/518))

The three tenant-facing scheduled jobs do **not** iterate tenants. Each cron
occurrence is a dispatcher:

1. `dispatchTenantJobs` keyset-pages `restaurants` (200 rows at a time, ordered
   by `id`), so the worker never holds the whole tenant table.
2. Each eligible tenant gets one `boss.insert()` job on the matching
   `tenant-*` queue, with `singletonKey = <restaurantId>:<occurrence>` (ISO week,
   day, or `<trial end>:<milestone>`) on a `short`-policy queue, so a repeated
   dispatch cannot double-queue a tenant.
3. The consumer settles every job in a batch individually
   (`perJobResults: true`): one tenant's failure is retried and eventually
   dead-lettered without touching its batch-mates.

`SCHEDULED_FANOUT_CONCURRENCY` (default 5) caps how many tenants one worker
processes at once. It is a Gemini/Resend rate-limit ceiling, not a throughput
target — raise it only with those quotas in mind.

**Observability.** Each dispatcher writes `{ scanned, considered, dispatched }`
to `app_flags` under `job_run:<label>`; `/admin/health` shows those alongside a
24-hour per-queue roll-up (done / sent / pending / failed) read from
`pgboss.job`. A run that only reached half the tenants shows up there — that was
the silent failure mode before #518.

## Invariants

- **Claim-before-do**: consumers claim with `fetch`/`UPDATE ... WHERE status` so
  two workers or a redeploy can't double-process.
- **Idempotent consumers**: extraction is re-runnable (content-hash gate
  prevents duplicate invoices); normalization upserts by key.
- **Dead-letter on failure**: unhandled job errors route to the dead-letter
  queue; payloads are redacted before landing there.
- **Startup order**: the worker runs `db:migrate` before registering jobs
  (see `DEPLOYMENT.md`); it must not run with a drifted schema.
- **No transport imports in job code**: `extraction-worker.ts` enqueues
  `whatsapp-notify` and never imports a WhatsApp client (ADR-025). The enqueue
  is best-effort — the invoice is already extracted, and losing the courtesy
  message must not undo that.
- **The worker must never sleep.** It serves no HTTP, so Railway's App Sleep
  stops the container ~10 minutes after each deploy and *nothing can wake it* —
  a queue consumer has no inbound request to trigger on. While it is stopped no
  job is consumed and no cron fires. This is config-as-code, not a dashboard
  setting: `railway.json` (web) keeps `sleepApplication: true`, and the worker
  service points its `railwayConfigFile` at **`railway.worker.json`**, which is
  the same config with `sleepApplication: false`. Flipping it in the Railway
  dashboard does not hold — the next deploy re-applies the file.
- **The worker hosts the WhatsApp socket** when `WHATSAPP_BOT_ENABLED=true`.
  It is long-lived, single-replica and DB-connected, which is what a persistent
  socket needs; `shutdown()` stops it before the process exits — a second reason
  the service cannot sleep, on top of the unconditional one above.

## What is lost while the worker is down

Not symmetrical, and worth knowing before deciding how urgent a restart is:

| Queue / job | Survives a stopped worker? |
|---|---|
| `extract-invoice` | The pg-boss job survives (14-day `retentionSeconds`), but `failStalledItems` marks the batch item `failed` with `extract.err.stalled` once it has waited `EXTRACTION_STALL_TIMEOUT_MS` (15 min). That reaper runs on the **web** request path — the batch page load and `/api/batch-status/[id]` — so the user sees a stalled upload and retries. Nothing is silently lost, and a late job cannot double-process: `markExtracting` only transitions from `queued`/`extracting`, so it no-ops against a `failed` row. |
| `normalize-product`, `categorize-product` | Fully. They sit in `created` and run when the worker returns. |
| The 8 `scheduled-*` crons | **No.** pg-boss cron has no catch-up: a schedule that does not fire while the process is down is skipped, not deferred. A missed weekly digest, overdue reminder or trial notice is simply never sent — `claimOnce` keys on the occurrence, so the next run does not backfill it. The sweeps (file purge, dead-letter purge, idempotency, MRR snapshot) are idempotent and catch up on their next run. `scheduled-analytics-refresh` skipping means every materialized view stays stale until the next 03:10, so `/analytics/spend` serves old numbers while every live-computed surface stays correct. |

## Operations pointers

- Check queue health: `/admin` shows worker/job status and dead-letter counts
  (`docs/05_operations/monitoring.md`).
- Testing: `tests/scheduler.test.ts` covers dispatcher eligibility and the
  per-tenant handlers; `tests/tenant-fanout.test.ts` covers keyset paging (up to
  5,000 tenants), dispatch counts and per-job settlement; per-queue consumers
  have integration tests in `tests/`.
- Changing a schedule or adding a queue is a docs event (update this file +
  the affected feature spec + its `## Code notes` section).

## Code notes

### `src/lib/server/worker-heartbeat.ts`

**`const WORKER_ID`**

- One fixed row, not one per process: several replicas share it, and the question the health page answers is "is *anything* consuming the queues", not "how many consumers are there".

**`function recordWorkerHeartbeat`**

- An idle beat must not clear `last_job_completed_at`, so the upsert re-selects the stored value instead of writing the parameter — otherwise every 30 s tick would erase the only evidence that work was ever done.
- `jobs_completed` accumulates in SQL rather than in the process, so a restart does not reset the counter and two replicas cannot clobber each other's total.

**`function workerLiveness`**

- Three states, because "no row" and "old row" mean different things to an operator: never deployed / never started, versus started and then died.
- Liveness is deliberately independent of job flow — an idle worker with no jobs to run is healthy, and reporting it as down would make the check cry wolf on every quiet night.

**`function startWorkerHeartbeat`**

- Beats immediately on boot so a freshly started worker is visible before the first interval elapses; the timer is `unref`'d so it never holds the process open during shutdown, and a failed write is logged rather than thrown (a heartbeat is diagnostics, not a reason to kill the worker).

### `src/lib/server/dead-letter.ts`

**`function tenantColumnValue`**

- A dead letter's whole input domain is malformed job data, so a blank or non-uuid `restaurantId` must not cost us the audit row: Postgres would reject the insert and the record would be lost exactly when it matters most. Non-uuid values become NULL in the column; the raw value still reaches the audit trail inside `payload`.

### `src/lib/server/extraction-worker.ts`

**`interface ExtractionJobData`**

- Extraction job handler — runs in the worker process. Claims the batch item via a guarded queued→extracting transition, calls Gemini, writes the result with markDone/markFailed. The worker only touches the columns it owns; web-side state can never be lost here.
- `sessionId` is a legacy payload field — jobs enqueued before the batch_items migration.

**`const DEGRADATION_ERRORS`**

- Transient LLM-degradation error classes worth alerting on when they spike.

**`function processExtractionJob`**

- Money gate: atomically claim a monthly extraction slot against the plan quota BEFORE any Gemini spend (issue #244). Skipped in the test path.
- Lapsed-trial backstop covering every door the file came through — web upload, WhatsApp or a retry of an older job (issue #287). The web upload action blocks earlier with a redirect; this covers the rest.
- Aggregate quota exhaustion is Sentry-reported, not a lone console.warn, so a tenant hitting the wall is visible (#257).
- Claim the item; a false means it is no longer queued (discarded or already processed) — drop the job and release the slot, since no extraction happened.
- Resolve the file to a local path the extraction engine can read: the Railway bucket driver downloads to a temp file; local storage computes the path directly.
- Global Gemini concurrency gate (issue #454): acquire a slot immediately before the model call and release it in the `finally` around that call only — not around annotate/markDone, which are DB-only and would just hold the slot longer. The semaphore is the single place `MAX_CONCURRENT_EXTRACTIONS` is enforced, holds across several worker processes (Redis-backed), and survives the timeout-abort path (#455).
- Test path uses the legacy GenerateFn (no token tracking); production uses the LLMProvider with token usage tracking.
- Tag Gemini degradation (timeout / 429 / 503) with its errorClass so an alert rule can catch a rate spike (#257). Activates once the worker initializes Sentry (#252); a no-op until then.
- Report every other failure too, but WITHOUT the raw error — extract.ts embeds invoice text in some messages and that must not reach Sentry (PII, #254). Ship only the error class + ids.
- A failed extraction doesn't count against the plan quota — release the claimed slot (#244).
- Do not re-throw: the error is stored on the item; no pg-boss retry.

### `src/lib/server/queue.ts`

**`const EXTRACTION_QUEUE`**

- pg-boss queue — web-process side (send-only). Lazy singleton: starts once on first use.

**`function getBoss`**

- pg-boss v10+ no longer auto-creates queues; send() requires the queue to exist first. `createQueue` is idempotent.

**`function enqueueExtraction`**

- Returns true when enqueued, false when a job for the same item is already pending/active (pg-boss `singletonKey` dedup). A deduped send is expected on duplicate submits and must never be treated as a failure.

**`function enqueueNormalize`**

- Low-priority async LLM normalization for a freshly-created product (issue #300). Deduped per (restaurant, product) so re-saves don't pile up jobs.

### `src/lib/server/scheduler.ts`

**`const DIGEST_QUEUE`**

- Scheduled jobs (issue #288). Everything here used to depend on somebody opening the app: the weekly digest was generated on a dashboard visit, and the overdue-invoice and trial-expiry templates had no callers at all — backwards, because those messages exist precisely for tenants who *stopped* opening the app. pg-boss (already in the stack for extraction) provides the cron; the worker registers these on boot — if the worker is not running, none of them fire, same contract as extraction. Tenant-by-tenant best-effort: since #518 each tenant is its own pg-boss job, so one restaurant's failure is retried and dead-lettered on its own instead of being logged and dropped. Each send is claimed through a guarded upsert on `settings` before the email goes out, so a retried job or a second worker cannot double-send.

**`const DIGEST_CRON`**

- Cron expressions are UTC; Spanish restaurants are UTC+1/+2, so 06:00 UTC lands early morning locally. `'0 6 * * 1'` — Mondays, with the week just closed.

**`const REMINDERS_CRON`**

- `'30 6 * * *'` — daily.

**`const TRIAL_CRON`**

- `'0 7 * * *'` — daily.

**`const PURGE_CRON`**

- `'0 3 * * *'` — daily, off-peak.

**`const DELETED_FILE_RETENTION_DAYS`**

- `30` — days a soft-deleted invoice keeps its uploaded file before it is purged.

**`const TRIAL_MILESTONES`**

- Trial milestones (days remaining) that get an email; `[7, 1, 0]`, 0 = the day it lapsed.

**`function claimOnce`**

- Claim a one-shot send for this tenant. Returns false when the value was already stored, which is what makes every job in this file safe to retry.

**`function ownerEmail`**

- Owner's email address, or null when the restaurant has no reachable owner.

**`function runWeeklyDigestJob`**

- Dispatcher (#518): queues one `tenant-weekly-digest` job per tenant whose plan includes the digest. The ISO week is resolved once, here, and travels in the payload — a job that runs late still sends the week it was dispatched for.

**`function sendWeeklyDigest`**

- Weekly digest for one tenant: generate this week's text via the same claim-then-generate path the dashboard uses, so a Monday visitor and this job never both pay Gemini; email to the owner. Claim AFTER generating — a generation failure should not consume the week's email slot.
- Per-tenant opt-out first (#577): `isAlertEnabled(rid, 'weekly_digest')` runs before generation, so a tenant that switched the digest off in Ajustes → Alertas never pays for a generation it will not receive.

**`function runOverdueRemindersJob`**

- Dispatcher (#518): one `tenant-overdue-reminder` job per tenant, keyed on today's date. Nothing is filtered here — whether anything is actually overdue is a per-tenant query, and it belongs in the handler.

**`function sendOverdueReminder`**

- Overdue invoices: one email per tenant per day, only when something is actually overdue.
- Gated on the `invoice_reminders` toggle (#577), checked before the overdue query so a tenant that turned reminders off neither gets the email nor burns the day's claim.

**`function trialDaysLeft`**

- Days remaining in a trial, rounded up. Negative once it has lapsed.

**`function trialMilestoneFor`**

- Which milestone a remaining-days count falls into, or null when the trial is still too far out. Bands are deliberately wide so a missed run (worker restart, outage) still sends the notice a day late instead of skipping it: 7 covers 7…2 days out, 1 the final day, 0 the lapse.

**`function runTrialNoticesJob`**

- Dispatcher (#518): the milestone is computed at dispatch from the page row, so a tenant not on a trial — or still more than a week out — costs no queue job at all.

**`function sendTrialNotice`**

- Trial expiry notices at T-7, T-1 and on the day the trial lapses. The milestone is stored, so moving between milestones sends exactly one email each and a re-run sends none. Claim keyed on the trial end date too, so a tenant that starts a fresh trial gets the full sequence again.

**`function runFilePurgeJob`**

- Retention purge (issue #289): a soft-deleted invoice keeps its uploaded file for `DELETED_FILE_RETENTION_DAYS` so a mistaken delete can be undone, then the file — supplier PII and financial data — is removed from storage and the row stops pointing at it. The row itself stays for the audit log.

**`function registerScheduledJobs`**

- Registers the three per-tenant fan-out queues first, then the cron queues, so a dispatched job always has a consumer waiting for it.
- Create the queues, register the cron schedules and start the consumers. `schedule()` is idempotent per queue: re-registering on every worker boot updates the cron rather than stacking duplicates, and pg-boss holds the schedule in the database so exactly one worker fires each occurrence.

### `src/lib/server/tenant-fanout.ts`

**`interface TenantSummary`**

- Shared fan-out plumbing for the scheduled jobs (issue #518, ADR-025). The jobs used to load every tenant with no LIMIT and walk them sequentially; at a few thousand tenants that ran past its own cron window, let one slow tenant block the rest, and reported success after covering a fraction of the table.

**`function tenantPage`**

- One keyset page of tenants, ordered by `restaurants.id`, joined to `subscriptions` for the plan fields the dispatchers filter on. Join order avoids the `eq(*.restaurantId, …)` shape the tenant-scope lint bans; this is a deliberate all-tenant scan, not a tenant filter. A tenant created mid-run is included or missed depending on where its uuid sorts — for a daily or weekly notice that is at worst a one-occurrence delay.

**`function dispatchTenantJobs`**

- Pages to the end of the table and bulk-inserts one job per eligible tenant per page, so peak memory is one page (`TENANT_PAGE_SIZE`) regardless of how many tenants exist. `jobFor` returning null skips a tenant without enqueueing anything.
- `dispatched` counts the ids pg-boss actually returned, which is lower than `considered` when the `short` queue policy deduped a tenant-occurrence that was already pending — a re-dispatch is visible rather than silently equal.

**`function recordJobRun`**

- The run summary is written to `app_flags` under `job_run:<label>` for `/admin/health`. Best-effort: a failed write is reported but never fails the dispatch, since losing the bookkeeping row must not cost the tenants their emails.

**`const TENANT_JOB_RETENTION_SECONDS`**

- A tenant job that never got picked up is deleted after 48 h rather than pg-boss's 14-day default. These are dated notices: a digest three days late is noise, and `claimOnce` means the tenant simply misses that occurrence instead of getting a stale one. Completed jobs keep pg-boss's default retention, which is what `/admin/health` reads its 24 h roll-up from.

**`function registerTenantFanout`**

- `perJobResults` is what makes one tenant's failure survivable: pg-boss settles each job in the batch on its own, so a throw fails that job (retry, then dead-letter) while its batch-mates complete. Throwing out of the handler itself would fail the whole batch, which is why `settleTenantJob` catches.
- `batchSize` is `SCHEDULED_FANOUT_CONCURRENCY` — a Gemini/Resend rate-limit ceiling, not a throughput target.
- The dead-letter drain mirrors the extraction one: a job pg-boss abandoned or exhausted retries on lands in the audit dead-letter table with its tenant id attached.

**`function settleTenantJob`**

- The handler's boolean becomes the job's `output.sent`, which is what `/admin/health` counts to answer "how many tenants actually got this?".

### `src/backfill-products.ts`

**`const all`**

- One-off backfill: link products + compute pack fields on existing line items (follow-up to #298/#299). Run once after deploying the catalog/pack features: `pnpm db:backfill-products`. Deterministic and idempotent — safe to re-run. Uses the same env as the web process / worker (DATABASE_URL etc.); dotenv loads .env in dev.
- One-off backfill: recompute `invoices.content_hash` after the tax breakdown became part of the hash. Run once after deploying that change: `pnpm db:backfill-content-hash`. Deterministic and idempotent — safe to re-run; rows whose new hash is already taken keep the old one and are reported as `collided`. Without it, invoices saved earlier can no longer be recognised as duplicates of a re-upload.

### `src/worker.ts`

**`property dsn`**

- Worker entry point — run alongside the web process. Dev: `pnpm worker` (vite-node with vite.worker.config.ts); prod: `node build/worker.js` (built via `pnpm build:worker`). Requires the same env vars as the web process (DATABASE_URL, GEMINI_API_KEY, etc.).
- `import 'dotenv/config'` must be the first import — it populates process.env from .env before any other module (db.ts etc.) is evaluated. ESM evaluates imports depth-first in source order, so this runs before queue.ts / sessions.ts / db.ts.
- Sentry.init (issue #252): the worker runs the core product loop (Gemini extraction) on a box nobody watches; without Sentry a crash or every-job-failing state is invisible until a customer complains. Same config as hooks.server.ts.

**`function fatal`**

- An unexpected throw or rejection would otherwise kill the process silently. Report it, flush, then exit non-zero so the platform restarts the worker.

**`property ssl`**

- `pgSslConfig()` — same TLS policy as the web pool (issue #295); this used to skip certificate verification unconditionally while the web process did not.

**`property batchSize`**

- `batchSize` = `MAX_CONCURRENT_EXTRACTIONS` (issue #454). The batch of jobs is processed concurrently, but the true cap on live Gemini calls is `acquireExtractionSlot()` inside each job, not the batch size — a larger `batchSize` only helps if the semaphore's global cap is also raised. Default 3 lets a small upload extract in parallel; set the cap to 1 for the historical strictly-sequential behaviour. `runWithDeadLetter` catches per-job, so one job's failure can't reject the shared handler promise and drag the rest of the batch down.
- Normalize-product consumer (issue #300): low-priority, best-effort — the handler swallows its own errors, so a failed suggestion never retries noisily.

**`function shutdown`**

- Cron-driven work — weekly digest, overdue reminders, trial notices and the deleted-file purge (issues #288/#289). Registered here because pg-boss holds the schedule in the database: whichever worker is up fires the occurrence.
