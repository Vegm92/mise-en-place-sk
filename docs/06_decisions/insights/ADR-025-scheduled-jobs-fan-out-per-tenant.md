# ADR-025 — Scheduled Jobs Dispatch One pg-boss Job per Tenant

**Status:** Active
**Feature:** Insights (digest, reminders, trial notices)
**Date:** 2026-08-25
**Issue:** [#518](https://github.com/Vegm92/mise-en-place-sk/issues/518)

## Context

[ADR-011](./ADR-011-scheduled-jobs-in-the-worker.md) put the weekly digest,
overdue reminders and trial notices on pg-boss cron inside the worker. Each of
those jobs began by loading **every** tenant in one unpaginated query and then
walked the list one tenant at a time:

```ts
const tenants = await allTenants();          // no LIMIT, no cursor
for (const tenant of tenants) { … }          // strictly sequential
```

Every iteration ran several queries, an owner-email lookup, and a synchronous
`sendEmail`; the digest additionally called Gemini through
`getOrGenerateWeeklyDigest`. That is fine at a few hundred tenants and breaks
at a few thousand:

- the digest serialises N Gemini calls — 2,000 tenants at ~3 s each is ~100
  minutes for one job, which overruns its own cron window and overlaps the next
  occurrence
- one slow tenant (large invoice set, a Gemini timeout, Resend throttling)
  blocks every tenant behind it
- `allTenants()` holds the whole tenant table in worker memory
- worst of all it fails **quietly**: `perTenant` caught per-tenant errors and
  continued, so a run that reached 40 % of tenants still reported success with a
  lower `sent` count. Nobody notices that the back half of the alphabet stopped
  getting digests.

Three options were on the table:

- **Keep the loop, add pagination.** Removes the memory problem and nothing
  else: still sequential, still one slow tenant blocking the rest.
- **Paginate plus bounded parallelism** (`p-limit`-style, ~10 at a time). Better
  wall clock, but it reimplements — in memory, per process — the concurrency,
  retry and dead-letter machinery pg-boss already has, and a worker restart
  mid-run still loses the remaining tenants.
- **Fan out onto a queue.** The cron job becomes a dispatcher; a worker handler
  processes one tenant per job. pg-boss then owns concurrency, retries and
  dead-lettering.

## Decision

**Each of the three tenant-facing scheduled jobs is split into a dispatcher and
a per-tenant handler**, connected by a new queue:

| Cron queue (dispatcher) | Fan-out queue (handler) | Handler |
|---|---|---|
| `scheduled-weekly-digest` | `tenant-weekly-digest` | `sendWeeklyDigest` |
| `scheduled-overdue-reminders` | `tenant-overdue-reminder` | `sendOverdueReminder` |
| `scheduled-trial-notices` | `tenant-trial-notice` | `sendTrialNotice` |

`src/lib/server/tenant-fanout.ts` holds the shared plumbing:

- **`tenantPage(afterId, pageSize)`** — one keyset page of tenants ordered by
  `restaurants.id`, joined to `subscriptions`. `TENANT_PAGE_SIZE = 200`, so the
  worker never holds more than 200 tenant rows at a time regardless of table
  size.
- **`dispatchTenantJobs(boss, spec)`** — pages to the end of the table and bulk
  `boss.insert()`s one job per eligible tenant per page. Eligibility (`jobFor`
  returning `null`) is decided from the page row, so an ineligible tenant costs
  no queue job and no query.
- **`registerTenantFanout(boss, handler)`** — creates the fan-out queue with a
  dead-letter sibling and starts the consumer.

Job payloads carry the occurrence identity computed **once, at dispatch**: the
ISO week, the day, or the `<trial end>:<milestone>` claim. A job that runs late
or is retried therefore still sends the occurrence it was dispatched for.

### The queue owns concurrency, retries and dead-lettering

The consumer runs with `batchSize = SCHEDULED_FANOUT_CONCURRENCY` (default 5)
and **`perJobResults: true`**, so every tenant in a batch is settled on its own:
a thrown error fails that one job — which pg-boss retries twice, 120 s apart,
then routes to `<queue>-dead-letter`, drained into the audit dead-letter table —
while its batch-mates complete normally. This is the property the old loop could
not have: one tenant's failure is now genuinely isolated *and* retried, instead
of being logged and dropped.

The default of 5 is a rate-limit ceiling, not a throughput target: the digest
handler calls Gemini and every handler calls Resend. Raise
`SCHEDULED_FANOUT_CONCURRENCY` when those quotas allow it.

Fan-out queues use pg-boss's `short` policy with a `singletonKey` of
`<restaurantId>:<occurrence>`, so a cron occurrence that fires twice (manual
run, redeploy) cannot enqueue the same tenant-occurrence twice while the first
is still pending.

### `claimOnce` stays

[ADR-011](./ADR-011-scheduled-jobs-in-the-worker.md)'s claim-before-send is
unchanged and still the real idempotency guard — it is what makes a pg-boss
retry, a duplicate dispatch and a manual re-run all safe, and it works exactly
the same under concurrency because it is a single guarded upsert.

### The counts are written down

`{ scanned, considered, dispatched }` per dispatcher run is stored in
`app_flags` under `job_run:<label>` and surfaced on `/admin/health`, alongside a
24-hour roll-up of the fan-out queues read from `pgboss.job`
(done / sent / pending / failed per queue; `sent` comes from the per-job output
each handler returns). A job that silently processed half its tenants is now a
number on a page instead of a gap in the logs.

## Consequences

- **Two queues per job now.** `/admin` shows six fan-out queues (three plus
  dead-letter siblings) that did not exist before, and `pnpm dev:all` is needed
  to see any of it locally — same contract as before, more moving parts.
- **A dispatcher run no longer means the work happened.** It means the work was
  queued. "Did the digest go out?" is answered by the per-tenant queue counts,
  not by the cron job's log line. The health page carries both for that reason.
- **`sent` is no longer a return value.** Callers that want it read the queue
  roll-up. The dispatcher returns `{ scanned, considered, dispatched }`.
- **Retries can now send late rather than never.** A tenant whose email failed
  is retried twice over ~4 minutes. The claim is taken before the send, so a
  retry after a *successful* claim does not resend — the failure mode ADR-011
  chose (a missed email, never a duplicate) is preserved.
- **Ordering across tenants is gone**, and nothing depended on it.
- **A queued job that is never picked up expires after 48 hours** rather than
  pg-boss's 14-day default. If the worker is down across a weekend, those
  tenants miss that occurrence instead of receiving a stale one — the same
  trade ADR-011 made when it chose a missed email over a duplicate.
- **The keyset cursor is `restaurants.id` (a uuid).** A tenant created mid-run
  may be missed or included depending on where its id sorts. For daily and
  weekly notices, that is at worst a one-occurrence delay for a restaurant that
  signed up minutes earlier.
- **`app_flags` gains job bookkeeping keys** (`job_run:*`) next to product flags
  such as `access_open`, the same trade already made for claim keys in
  `settings`.
- Held in place by `tests/tenant-fanout.test.ts` (keyset paging including a
  5,000-tenant walk, dispatch counts, per-job settlement under a failing tenant)
  and `tests/scheduler.test.ts` (dispatcher eligibility + handler behaviour).

## Related

- [ADR-011](./ADR-011-scheduled-jobs-in-the-worker.md) — the schedule and the
  claim-before-send pattern this amends
- [ADR-002](../ingestion/ADR-002-durable-extraction-pipeline.md) — the same
  pg-boss instance, and the dead-letter convention reused here
- [ADR-018](./ADR-018-one-snapshot-for-chat-and-digest.md) — what the digest
  handler generates
