# ADR-003 — Drizzle Workflow: Committed Migrations Are Canonical

**Status:** Active  
**Feature:** Data & schema  
**Date:** 2026-08-02  
**Issue:** [#345](https://github.com/Vegm92/mise-en-place-sk/issues/345)

> **Amendment (2026-08-03, ADR-005).** The decision — committed migrations are
> canonical, guarded by `db:check-sync` — is unaffected. Some of the supporting
> context below was written the day before #373 dropped the RLS policies and is
> now false: `0001_rls_policies.sql` defines no policies, the deploy runbooks no
> longer check that policies landed (they check the opposite), and `db:push`
> iterates against a local or Railway database rather than a dev Supabase
> project. The RLS-specific warning about `db:push` no longer applies; the
> general warning about raw-SQL migration content still does.

> **Amendment (2026-08-10, ADR location).** References below to
> `docs/ARCHITECTURE_DECISIONS.md` are historical. That file no longer exists: its
> five ADRs were split into [`docs/06_decisions/`](../README.md), one per file in a per-feature
> folder, and the emptied file was deleted along with its `.gitignore` exception.
> The substance of the last Consequence is unchanged and now applies to
> `docs/06_decisions/` — ADRs are a committed engineering record, not a
> local-only artefact. That
> gitignore fix is what made the split possible; `doc/` sits outside the
> `/docs/*` rule and needs no exception.

## Context

`drizzle/` holds 26 committed SQL migration files, but `CONTEXT.md`'s dev-commands section
described `pnpm db:push` as "the dev workflow — no migration files," which reads as if migration
files are vestigial. They are not:

- `drizzle/0001_rls_policies.sql` defines the RLS policies ADR-001 references. RLS policies are
  raw SQL, not part of `schema.ts` — `db:push` diffs against `schema.ts` only, so it **cannot**
  apply or re-apply them.
- `ci.yml` already runs `pnpm db:migrate` to bootstrap the ephemeral CI Postgres before tests.
- `DEPLOYMENT.md` documents `pnpm db:migrate` as the staging/production
  deploy step, with an explicit post-migrate check that the RLS policies landed.

So the committed migrations were already the real source of truth for CI, staging, and prod.
`CONTEXT.md`'s line was describing a local convenience shortcut, not the deploy path, but didn't
say so — read in isolation it implied the opposite of what `DEPLOYMENT.md` documents.

Separately: `drizzle/meta/` only has snapshot files for migrations 0022–0025; 0000–0021 have no
corresponding `meta/NNNN_snapshot.json`. This looks like drift on first read. It isn't:
drizzle-kit's diff engine only reads the **latest** snapshot referenced by `meta/_journal.json` to
compute the next migration — it does not replay every prior snapshot. Running `drizzle-kit
generate` against current `schema.ts` in a clean worktree confirms this: "No schema changes,
nothing to migrate" — `drizzle/` is already in sync with `schema.ts`. The missing older snapshots
are a cosmetic history gap, not a broken chain, and don't need to be backfilled.

Also discovered while resolving this: this file (`docs/ARCHITECTURE_DECISIONS.md`) was covered by
the blanket `/docs/*` gitignore rule, meaning ADR-001 and ADR-002 were never actually committed —
they only existed in one local checkout. Fixed alongside this ADR (see `.gitignore`).

## Decision

**Committed migrations are canonical.** `drizzle/*.sql` is the source of truth for schema history
and the only mechanism that applies raw-SQL concerns (RLS policies, custom indexes) that don't
round-trip through `schema.ts`.

- `pnpm db:generate` — run after any `schema.ts` change; commit the resulting `drizzle/*.sql` +
  `drizzle/meta/*_snapshot.json` in the same PR as the schema change.
- `pnpm db:migrate` — the only command that applies schema to CI, staging, and production.
- `pnpm db:push` — **local dev convenience only.** Fast iteration against a personal/dev Supabase
  project while shaping a schema change, before running `db:generate` to capture it as a real
  migration. Never run against staging or production — it silently skips RLS and other raw-SQL
  migration content.

**Prod-safety mechanism:** `pnpm db:check-sync` (`scripts/check-drizzle-sync.mjs`, wired into
`ci.yml`) runs `drizzle-kit generate` in CI and fails the build if it produces a new migration
file — i.e. if `schema.ts` changed without a matching committed migration. This is the automated
guard against the exact split #345 was raised to catch. It cleans up any generated file/snapshot
before exiting, so a failed CI run doesn't leave stray artifacts behind.

## Consequences

- A PR that edits `schema.ts` without running `pnpm db:generate` fails CI at the "drizzle/ in sync
  with schema.ts" step, with a message telling the author what to run.
- `db:push` remains available and documented for local iteration speed, but is explicitly scoped
  to dev-only in `CONTEXT.md` and this ADR — it is not a deploy mechanism.
- `drizzle/meta/0000_snapshot.json`–`0021_snapshot.json` remain absent; no backfill is needed
  since drizzle-kit's diffing only depends on the latest snapshot in the chain.
- ~~`docs/ARCHITECTURE_DECISIONS.md` is now tracked in git (previously gitignored by accident).~~
  Superseded 2026-08-10: the ADRs are tracked in [`docs/06_decisions/`](../README.md) instead, and that file
  has been deleted. The point stands — ADRs are committed, not local-only.

