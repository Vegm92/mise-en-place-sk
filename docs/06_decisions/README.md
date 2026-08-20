# Architecture Decision Records

This directory is the canonical home for Mise en Place's ADRs. One file per
decision, grouped into a folder per feature area. (Moved here from the repo-root
`doc/` on 2026-08-13; history preserved via `git mv`.)

An ADR records **why** the code is shaped the way it is: the forces in play, the
option taken, the options rejected, and what the team now has to live with. It is
not a design doc (that describes what to build) and not documentation (that
describes how to use it). If you find yourself re-litigating a decision in a PR
review, the ADR is where the previous round of that argument lives.

For *how the code works*, see the per-subsystem `## Code notes` sections (`docs/03_features/` + `docs/04_engineering/`). For
*how to deploy it*, see [`DEPLOYMENT.md`](../../DEPLOYMENT.md).

## Index

### [`tenancy/`](./tenancy) — multi-tenant isolation

| ADR | Decision | Status |
|---|---|---|
| [001](./tenancy/ADR-001-app-level-tenant-scoping.md) | Tenant isolation via `forTenant().scope()`, not RLS | Active, amended by 005 |
| [005](./tenancy/ADR-005-rls-retired.md) | RLS policies dropped on Railway; app-layer scoping is the only boundary | Active |

### [`ingestion/`](./ingestion) — upload → extract → confirm

| ADR | Decision | Status |
|---|---|---|
| [002](./ingestion/ADR-002-durable-extraction-pipeline.md) | Durable extraction on pg-boss with a database state machine | Active, amended by 015 |
| [015](./ingestion/ADR-015-batches-replace-single-file-sessions.md) | Multi-document batches replace single-file upload sessions | Active |
| [016](./ingestion/ADR-016-storage-driver-and-upload-validation.md) | Two-driver storage seam; uploads validated by magic bytes | Active |
| [017](./ingestion/ADR-017-offline-first-upload-queue.md) | Offline uploads queued in IndexedDB and replayed automatically | Active |

### [`extraction/`](./extraction) — AI document understanding

| ADR | Decision | Status |
|---|---|---|
| [006](./extraction/ADR-006-file-classification-routes-extraction.md) | File class decides the extraction route (text PDF / vision / XML) | Active |
| [007](./extraction/ADR-007-llm-provider-seam.md) | A one-method provider seam plus per-tenant usage accounting | Active |

### [`invoicing/`](./invoicing) — the invoice write path

| ADR | Decision | Status |
|---|---|---|
| [008](./invoicing/ADR-008-single-invoice-write-path.md) | One write path, four duplicate guards, non-fatal side effects | Active |
| [009](./invoicing/ADR-009-unit-normalisation-and-product-identity.md) | Product identity resolved in three escalating tiers | Active |

### [`insights/`](./insights) — alerts, budgets, reminders, digest, chat

| ADR | Decision | Status |
|---|---|---|
| [010](./insights/ADR-010-alerts-computed-on-save.md) | Alerts computed at save time and persisted, not derived at read time | Active |
| [011](./insights/ADR-011-scheduled-jobs-in-the-worker.md) | Cron jobs run on pg-boss in the worker; every send is claimed first | Active |
| [018](./insights/ADR-018-one-snapshot-for-chat-and-digest.md) | Chat and digest read one Markdown snapshot, never the database | Active |

### [`analytics/`](./analytics) — spend, prices, extraction quality

| ADR | Decision | Status |
|---|---|---|
| [012](./analytics/ADR-012-materialised-view-rollups.md) | Analytics reads pre-aggregated materialized views | Active — **refresh mechanism unresolved** |

### [`billing/`](./billing) — plans, trial, quota

| ADR | Decision | Status |
|---|---|---|
| [013](./billing/ADR-013-tiers-trial-and-quota.md) | Stripe owns money, Postgres owns entitlement | Active |
| [023](./billing/ADR-023-entitlement-gate-is-route-declared.md) | Entitlement declared per route, enforced in one hook | Active |
| [024](./billing/ADR-024-one-subscription-per-user.md) | One subscription per user; tier sets restaurant capacity | Active |

### [`identity/`](./identity) — auth and session

| ADR | Decision | Status |
|---|---|---|
| [014](./identity/ADR-014-authjs-jwt-sessions-and-active-restaurant.md) | Auth.js JWT sessions; active restaurant re-resolved per request | Active |

### [`whatsapp/`](./whatsapp) — WhatsApp ingestion channel

| ADR | Decision | Status |
|---|---|---|
| [004](./whatsapp/ADR-004-whatsapp-converges-on-batch-pipeline.md) | WhatsApp converges on the batch upload pipeline | Active, cutover complete |
| [019](./whatsapp/ADR-019-phone-number-is-the-tenant-key.md) | Phone number is the tenant key, bound by a short-lived pairing code | Active |

### [`data/`](./data) — schema and migrations

| ADR | Decision | Status |
|---|---|---|
| [003](./data/ADR-003-committed-migrations-are-canonical.md) | Committed Drizzle migrations are canonical; `db:push` is dev-only | Active |

### [`experience/`](./experience) — UI conventions

| ADR | Decision | Status |
|---|---|---|
| [020](./experience/ADR-020-both-viewports-rendered-css-chooses.md) | Separate mobile/desktop components, both rendered, CSS picks one | Active |
| [021](./experience/ADR-021-bilingual-single-string-table.md) | One in-repo string table, Spanish first, enforced in CI | Active |

### [`conventions/`](./conventions) — repo-wide engineering rules

| ADR | Decision | Status |
|---|---|---|
| [022](./conventions/ADR-022-invariants-enforced-in-ci.md) | Architectural invariants are CI gates, not conventions | Active |

## Conventions

**Numbering is global and sequential.** ADR-014 is ADR-014 wherever it lives, so
a reference in code, a commit message or an issue resolves without a path. Next
number: **025**.

**Folders group; they do not scope.** A decision belongs in the folder of the
feature it most affects. Decisions that touch several areas live with the primary
one and cross-link from the others via a *Related* section.

**Filenames** are `ADR-NNN-kebab-case-summary.md`. The summary states the
decision, not the topic — `ADR-008-single-invoice-write-path`, not
`ADR-008-invoices`.

**Status** is one of:

- `Active` — in force
- `Active — amended by ADR-NNN` — still in force, with a named correction
- `Superseded by ADR-NNN` — replaced; kept for the history
- `Proposed` — written, not yet decided

**This directory is the only ADR home.** ADR-001 to ADR-005 were originally
sections of a single `docs/ARCHITECTURE_DECISIONS.md`; they were split into the
files above on 2026-08-10 and that file was deleted. The records moved here from
the repo-root `doc/` on 2026-08-13. The rest of `docs/` holds how-the-code-works
and how-to-operate documentation (the `## Code notes` sections, the `00_system`–`07_ai`
layers), not decisions.

## For agents

- Read the ADRs that touch an area *before* changing it — they are referenced by
  `docs/00_system/architectural_invariants.md` and the affected feature spec.
- The operating workflow lives in `docs/07_ai/agent_workflow.md`; classify a
  change with `docs/07_ai/change_protocol.md` (next ADR number: **025**).

**ADRs are amended, not rewritten.** When reality moves, add a dated amendment
block at the top and strike through what is no longer true, leaving the original
readable. ADR-001 and ADR-003 are worked examples: their Supabase-era reasoning
is preserved with the Railway-era correction alongside, which is what makes them
useful a year later.

## Adding one

Copy [`_template.md`](./_template.md), take the next number, put it in the
feature folder, and add a row to the index above.

Write an ADR when a choice will be expensive to reverse, when a reviewer would
reasonably ask "why not the obvious thing?", or when the answer depends on
context that is not visible in the diff. Do not write one for a decision the code
already makes obvious.

State what was rejected and why. An ADR that only records what was chosen is
half an ADR — the value is almost always in the option that was not taken.
