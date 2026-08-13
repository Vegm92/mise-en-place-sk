# Feature Spec — Digest (weekly AI summary)

## Purpose

Send each restaurant a short AI weekly summary of its purchasing — what changed,
budget status, price shocks, recommendations — as a page and (for eligible
tenants) an email.

## Actors

- Signed-in member with `weeklyDigest` entitlement (Pro/Business).
- The worker's scheduled digest job.

## Preconditions

- `GEMINI_API_KEY`; tenant has data; feature enabled.

## Inputs

- Current ISO week key (`YYYY-Www`).
- The shared context snapshot (`buildChatContext`).

## Outputs

- `settings.weekly_digest_week/_text/_dismissed` rows.
- `/digest` page; scheduled email via Resend.

## Business rules

- **Generation** (`weekly-digest.ts`): `getOrGenerateWeeklyDigest(rid, week)`;
  atomic claim via `claimDigestWeek` (upsert `setWhere value <> week` +
  returning) — exactly one concurrent caller generates; losers reuse stored text.
- **Prompt**: same snapshot as chat (ADR-018), ≤ 150 words, six sections ending
  with "Recommended:".
- **Failure**: generation error restores the old week for retry.
- **Scheduling**: cron `0 6 * * 1` (Mon 06:00 UTC); filtered to
  `TIERS[tier].features.weeklyDigest`; email deduped by
  `claimOnce('weekly_digest_email_week')`.
- **On-visit**: `/digest` load generates if missing and the feature is enabled
  (gated: no feature → redirect `/billing?upgrade=digest`); `dismissDigest`
  action sets `_dismissed`.
- Digest calls Gemini **directly** — usage not recorded (same gap as chat; fix
  contract in `docs/04_engineering/llm_usage_metering.md`).

## State transitions

`settings.weekly_digest_week` advances; `_dismissed` set on dismiss.

## Data dependencies

`settings`, invoices/suppliers/budgets/stock (via snapshot), `subscriptions`.

## API dependencies

`/digest` load + dismiss action.

## UI dependencies

`digest/+page.svelte`; email template via `email.ts`.

## Background dependencies

Digest cron in `registerScheduledJobs` (ADR-011).

## External dependencies

Gemini; Resend (email).

## Validation

Week claim atomicity; feature gate; tenant scope.

## Error states

- Generation failure → old week retained, next run retries.
- Email send failure → claim released? (verify in `alerts.ts` digest runner) so
  the mail is retried.

## Edge cases

- Two requests race for the same week — one wins, both render the same text.
- Tenant with no data — snapshot is minimal; digest still generated.

## Security rules

- Snapshot is tenant data as data (ADR-018); settings scoped to tenant.

## Idempotency rules

- `claimDigestWeek`/`claimOnce` make the per-week generation and email
  single-shot.

## Observability

- `trackEvent('digest_viewed')`; digest failures visible in system health.

## Acceptance criteria

- First `/digest` visit in a week generates + persists the week text; subsequent
  visits reuse it.
- Eligible tenants receive one email per week (deduped).
- Tests: `tests/scheduler.test.ts` (job registration); digest-specific tests
  absent — verify manually or add coverage.
