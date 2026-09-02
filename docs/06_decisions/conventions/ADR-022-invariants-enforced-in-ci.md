# ADR-022 — Architectural Invariants Are CI Gates, Not Conventions

**Status:** Active
**Feature:** Repo-wide conventions
**Date:** 2026-08-09
**Issues:** [#138](https://github.com/Vegm92/mise-en-place-sk/issues/138), [#345](https://github.com/Vegm92/mise-en-place-sk/issues/345), [#380](https://github.com/Vegm92/mise-en-place-sk/issues/380)

## Context

Several decisions in this repository are only true if every future change keeps
them true. [ADR-001](../tenancy/ADR-001-app-level-tenant-scoping.md) is the
starkest: since [ADR-005](../tenancy/ADR-005-rls-retired.md) dropped RLS,
`forTenant().scope()` is the *only* thing standing between one restaurant's data
and another's. One forgotten `WHERE` clause is a cross-tenant leak, and no
database policy will catch it.

A convention written in a document does not survive a hurried change at 11pm.
What survives is a red build.

## Decision

**Every invariant that can be checked mechanically is a script in `scripts/`,
wired into `ci.yml` as its own step.** Five gates run before typecheck, tests and
build:

| Gate | Bans | Rationale |
|---|---|---|
| `lint:no-sql-raw` | `sql.raw(` anywhere in `src/` | Unparameterised SQL is an injection surface. Every raw template must interpolate through Drizzle's binding. |
| `lint:tenant-scope` | `eq(*.restaurantId, …)` in routes and server lib | Forces `forTenant().scope()`, whose constructor throws on an empty id — ADR-001's guarantee |
| `lint:unscoped-query` | `.from(<tenantTable>)` with no tenant predicate in its `.where(` | Catches the omission the previous gate cannot see: no filter at all |
| `lint:i18n` | User-facing string literals in `.svelte` | [ADR-021](../experience/ADR-021-bilingual-single-string-table.md)'s leakage failure |
| `db:check-sync` | `schema.ts` changed without a committed migration | [ADR-003](../data/ADR-003-committed-migrations-are-canonical.md)'s split |

### The gates read the schema rather than a hardcoded list

`tenantScopedTables()` derives the tenant table set **from `schema.ts`** — every
table declaring a `restaurantId` column. A newly added tenant table is covered by
`lint:unscoped-query` the moment it is declared, with nobody remembering to
update the linter. `restaurants` (it *is* the tenant), `user_restaurants` (keyed
by user) and `subscriptions` (keyed by Stripe customer) are the explicit
exclusions, matching ADR-001's non-tenant set.

The gate also refuses to run if it derives zero tables — a schema refactor that
breaks the derivation fails the build rather than passing vacuously.

### Only the filter counts

`lint:unscoped-query` looks for a tenant predicate **inside `.where(`**
specifically. Selecting the column (`.select({ restaurantId: t.restaurantId })`)
proves nothing about which rows come back — an easy false pass that the gate is
written to exclude.

### Exceptions are annotated, in place, with a reason

`// tenant-scope-ok: <reason>` suppresses the check for one statement, and the
reason is mandatory by convention. The legitimate exceptions in this codebase all
carry one:

- `batch-core.ts` — items are fetched by id and return `restaurantId` for the
  caller to compare ([ADR-015](../ingestion/ADR-015-batches-replace-single-file-sessions.md))
- `whatsapp-bot.ts` — the contact lookup *is* the tenant resolution step
  ([ADR-019](../whatsapp/ADR-019-phone-number-is-the-tenant-key.md))
- `runFilePurgeJob` — a platform-wide retention sweep by design
  ([ADR-011](../insights/ADR-011-scheduled-jobs-in-the-worker.md))

An annotation is a code-review artefact: it appears in the diff, it names its
reason, and it is greppable. Every current one is cited from an ADR.

### Explanatory comments are banned from `src/`

`lint:no-comments` rejects prose comments in
source. Only machine-directed pragmas survive: `@ts-*`, `eslint*`,
`svelte-ignore`, `prettier-ignore`, `@vite-ignore`, coverage ignores,
`/// <reference`, `@license`/`@preserve`.

Explanation lives in per-subsystem `## Code notes` sections, structured to mirror the source tree.
The reasoning: comments drift from the code they describe and nothing detects it,
while a separate document is explicitly a document — reviewed as prose, updated as
prose, and never mistaken for something the compiler checks.

`tenant-scope-ok:` annotations are the deliberate exception, because they are
consumed by a linter rather than by a reader.

## Consequences

- **CI ordering is deliberate.** The five gates run *before* `pnpm check`, tests,
  migration and build. They are fast, and a tenant-scope violation should fail in
  seconds rather than after a full test run.
- **The gates are regex and AST heuristics, not sound analysis.** A cross-tenant
  leak expressed through an unusual query shape can pass. They raise the floor;
  they do not prove isolation. `tests/tenant-isolation.test.ts` and
  `tests/tenant-isolation-routes.test.ts` carry the rest of that weight, and #380
  tracks strengthening both.
- **False positives are handled by annotation or allowlist**, never by weakening
  a gate. A gate with a documented exception is stronger than a gate that stopped
  running.
- **The no-comments rule puts a real burden on the `## Code notes` sections.** The
  explanations were once a single monolith that grew to ~6 200 lines; as of 2026-08
  it was retired and split into condensed per-subsystem `## Code notes` sections,
  still tracked under `docs/` and still structured by file. That removes the
  single-bloated-file cost while keeping the policy: the notes must still be updated
  alongside the code they describe, with no mechanical check that they were. That is
  the accepted cost of keeping `src/` free of drifting prose.
- **Adding an invariant means adding a gate.** If a rule matters enough to write
  in an ADR and can be checked mechanically, it belongs in `scripts/` and
  `ci.yml` — not only in prose.

## Related

- [ADR-001](../tenancy/ADR-001-app-level-tenant-scoping.md) — the invariant the gates exist for
- [ADR-003](../data/ADR-003-committed-migrations-are-canonical.md) — the schema-drift gate
- [ADR-021](../experience/ADR-021-bilingual-single-string-table.md) — the i18n gate
