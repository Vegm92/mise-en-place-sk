# ADR-011 — Scheduled Jobs Live in the Worker, and Every Send Is Claimed First

**Status:** Active, amended by [ADR-025](./ADR-025-scheduled-jobs-fan-out-per-tenant.md)
**Feature:** Insights (digest, reminders, retention)
**Date:** 2026-08-09

## Context

Five things must happen on a clock rather than in response to a user action: the
weekly digest, the overdue-invoice reminder, trial-expiry notices, the purge of
files behind soft-deleted invoices, and the MRR snapshot.

Four options were available:

- **Platform cron** (Railway scheduled jobs) — a separate deploy target per job,
  and job code that cannot easily share the app's modules.
- **`pg_cron`** — what migration `0005` originally proposed for the analytics
  rollups. It requires a database extension the hosting provider must enable, and
  it puts application logic in SQL.
- **`setInterval` in the web process** — fires N times with N replicas, and dies
  on every deploy mid-run.
- **pg-boss scheduling in the worker** — the job queue already in the stack for
  extraction ([ADR-002](../ingestion/ADR-002-durable-extraction-pipeline.md)).

The last one costs nothing new: pg-boss stores its schedule in Postgres and
already owns a leader-election mechanism for cron dispatch.

## Decision

**`registerScheduledJobs(boss)` runs in the worker process only**, registering
all five jobs from one declarative table:

| Queue | Cron (UTC) | Job |
|---|---|---|
| `scheduled-weekly-digest` | `0 6 * * 1` | Weekly AI digest email |
| `scheduled-overdue-reminders` | `30 6 * * *` | Overdue-invoice email |
| `scheduled-trial-notices` | `0 7 * * *` | Trial expiry at 7 / 1 / 0 days |
| `scheduled-file-purge` | `0 3 * * *` | Delete files for invoices soft-deleted > 30 days ago |
| `mrr-snapshot` | see `revenue-metrics.ts` | Revenue metrics snapshot |
| `scheduled-analytics-refresh` | `10 3 * * *` | Refresh the analytics materialized views ([ADR-012](../analytics/ADR-012-materialised-view-rollups.md), [#424](https://github.com/Vegm92/mise-en-place-sk/issues/424)) |

All are registered with `{ tz: 'UTC' }` — explicitly, not by default — so the
schedule does not shift under Spanish daylight saving. A 06:00 UTC digest lands
at 07:00 or 08:00 Madrid time depending on season; predictable drift beats a
schedule that silently changes meaning twice a year.

The web process **never** registers them. `src/worker.ts` is the only caller.
This is what makes the schedule safe to run alongside multiple web replicas.

### Every outbound send is claimed before it is sent

The load-bearing pattern is `claimOnce(restaurantId, key, value)`:

```sql
INSERT INTO settings (restaurant_id, key, value) VALUES (…)
ON CONFLICT (restaurant_id, key)
DO UPDATE SET value = :value WHERE settings.value <> :value
RETURNING value
```

An empty `RETURNING` means this exact `(tenant, key, value)` was already
processed — so the email is not sent again. The claim value is the natural
identity of the occurrence:

- digest → the ISO week (`2026-W32`)
- overdue reminder → today's date
- trial notice → `<trial end date>:<milestone>`, so the 7-day and 1-day notices
  claim separately while a retried 7-day notice does not resend

**The claim is taken before the email, not after.** The failure mode this
chooses is *a missed email*, not *a duplicate email*: if `sendEmail` throws after
a successful claim, that tenant's digest is skipped for that week. For a product
whose users are restaurateurs receiving mail about their own money, sending twice
is worse than sending late.

This also makes the jobs safe against pg-boss retries, against a worker restarting
mid-run, and against an operator firing a job manually.

### Per-tenant isolation inside a job

> **Amended by [ADR-025](./ADR-025-scheduled-jobs-fan-out-per-tenant.md)
> ([#518](https://github.com/Vegm92/mise-en-place-sk/issues/518)):** the
> `perTenant` loop described below was replaced by a dispatcher that queues one
> pg-boss job per tenant. Eligibility filtering and the claim-before-send rule
> are unchanged; isolation, retries and dead-lettering are now pg-boss's.

`perTenant` iterated every tenant and contained failures per tenant, returning
`{ considered, sent }`. One restaurant's broken data could not stop the other 400
from getting their digest. Every job returned that pair and the scheduler logged
it with a duration, so a job that "ran fine" but sent nothing was visible in logs.

Tenant eligibility is filtered before the fan-out, not inside the handler: the
digest job filters to plans where `TIERS[planTier].features.weeklyDigest` is
true, and the trial job to `status === 'trialing'`.

## Consequences

- **No worker means no scheduled anything.** `pnpm dev` alone runs the web app;
  digests, reminders, trial notices and purges are all silent. `pnpm dev:all` is
  the correct dev command, for the same reason extraction needs it.
- **The retention purge is deliberately cross-tenant.** `runFilePurgeJob` sweeps
  every tenant's soft-deleted invoices past 30 days and is marked
  `tenant-scope-ok` for the `lint:tenant-scope` gate. It carries `restaurantId`
  through to the file deletion so the storage side stays per-tenant. This is the
  intended exception shape for platform-wide jobs: annotate and justify at the
  query, never widen `forTenant`.
- **The claim keys live in `settings`**, the same per-tenant key/value table used
  for user preferences. It keeps the schema small; the cost is that job
  bookkeeping and user configuration share a namespace. Job keys are prefixed
  distinctly (`weekly_digest_email_week`, `overdue_reminder_sent_day`,
  `trial_notice_sent`) to keep them recognisable.
- **`DELETED_FILE_RETENTION_DAYS = 30`** is the app's answer to "how long after
  deleting an invoice can I get the file back" — 30 days of soft delete, then the
  bytes go. The database row remains.
- Scheduled jobs are not covered by tenant quota or billing gates. They send
  email; they do not extract. The digest itself does call Gemini via
  `getOrGenerateWeeklyDigest`, whose tokens are outside `llm_usage_log` — see
  [ADR-007](../extraction/ADR-007-llm-provider-seam.md).

## Related

- [ADR-002](../ingestion/ADR-002-durable-extraction-pipeline.md) — the same pg-boss instance
- [ADR-018](./ADR-018-one-snapshot-for-chat-and-digest.md) — what the digest job generates
- [ADR-013](../billing/ADR-013-tiers-trial-and-quota.md) — the trial dates the notice job reads
