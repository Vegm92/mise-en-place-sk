# Change Protocol

Classifies every change into a level with escalating requirements, so the
blast radius is analysed *before* editing — never after.

## Levels

### Level 1 — Cosmetic

UI copy, styling, non-semantic markup, typo fixes, README tweaks.

- Requirements: follow conventions; `pnpm check`.
- No plan, no dependency analysis.

### Level 2 — Local logic

Bugs or small changes inside one module without crossing seams: a fix in
`alerts.ts`, a tweak in a single route handler, a test addition.

- Requirements: read the affected feature spec + the module's existing tests;
  run the module's tests + `pnpm check`.
- No plan needed, but a one-line change note is welcome.

### Level 3 — Cross-cutting

Touches more than one module/route, a DB column, an external integration
surface, an API contract, or async/worker behaviour.

- Requirements:
  - Dependency analysis — check `docs/00_system/dependency_map.md` and update
    it if edges move.
  - A short plan per `docs/07_ai/task_planning.md`.
  - Full verification: `pnpm check`, `pnpm test` (DB suites on local Postgres),
    all lint gates, `pnpm build`; `pnpm db:check-sync` if schema touched.
  - Doc event: update the affected feature spec + its `## Code notes` section.

### Level 4 — Architectural

Changes an established decision: schema/migration, invoice write path,
tenancy model, entitlement logic, security controls, ingestion pipeline shape,
new background job or schedule, storage driver, auth flow.

- Requirements: everything from Level 3, plus:
  - Explicit plan reviewed against `docs/00_system/architectural_invariants.md`.
  - Read the ADR(s) covering the area; if the *why* changes, write a new ADR
    (next number 023) or amend the existing one per `docs/06_decisions/README.md`.
  - Migration committed + `db:check-sync` green (ADR-003) when schema is touched.
  - Side effects list (webhooks, queues, cron) reviewed for idempotency.

### Level 5 — Strategy / architecture-wide

Changes the source-of-truth hierarchy itself, replaces a subsystem, or alters
the tenancy/billing/security contract globally.

- Requirements: everything from Level 4, plus an explicit ADR-first write-up,
  a rollout plan (deploy order, data migration, backfill), and sign-off from
  the owner recorded in CONTEXT.md.

## Cross-level gates that always apply

- No bypassing auth, tenant scope, webhook signatures, rate limits, or
  validation "for convenience".
- No new invoice-creation path (ADR-008); no dynamic SQL for chat (ADR-018);
  no `@google/generative-ai` (use `@google/genai`).
- No inline comments; strings through i18n; statuses stay `text`.
- Idempotency preserved: retries must not duplicate invoices, Stripe
  processing, or WhatsApp processing.
- Any async change accounts for the separate worker process.

## If you are unsure

Classify up, not down. A wrong "it's just Level 2" is how schema drift,
double-write paths, and entitlement leaks happen. When in doubt, write the
short plan — it costs less than a rollback.
