---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

# Database Change Procedure

How to change the schema safely. The migration is the artifact of record, not
the schema file (ADR-003).

## Canonical sources

- Drizzle schema in `src/lib/server/schema.ts` — one file, 40 tables.
- Committed migrations in `drizzle/` (latest: `0042_*.sql`).
- `drizzle.config.ts` drives generate/migrate/studio.

## Rules

- **`db:push` is dev-only.** Never rely on it for a durable schema change.
- **Every schema change requires a committed Drizzle migration** via
  `pnpm db:generate` (ADR-003). `db:check-sync` fails CI on drift.
- **No Postgres enums.** Statuses are `text` with app-level defaults
  (`src/lib/status.ts`, `src/lib/constants.ts`).
- **Tenancy**: new business tables MUST carry `restaurant_id`. Keep app-layer
  scoping as the only boundary (ADR-005). (Exceptions that exist today:
  `user_restaurants`, `subscriptions`, `users`.)
- **Indexes**: add the index that the query plan needs (notification reads:
  `(restaurant_id, status, created_at)`; dedup PKs; unique keys for upserts).
- **Naming**: snake_case plural tables, singular columns; statuses default
  `pending`/`active`-style.
- **Column type changes**: `db:generate` emits a bare
  `ALTER COLUMN ... SET DATA TYPE x`. Postgres aborts that whenever no implicit
  cast exists (e.g. `text` → `uuid`), so hand-add the `USING` clause to the
  generated SQL. Keep the cast strict rather than filtering bad rows: it then
  fails loudly and rolls the migration back instead of converting partially
  (migration 0038).
- **Existing-data migrations**: write them idempotently (guards + `WHERE` on
  current state); never hardcode generated ids. Data migrations run in the
  worker's migration step and via `pnpm db:migrate`.

## Procedure (Level 4 change — see `docs/07_ai/change_protocol.md`)

1. Edit the relevant file under `src/lib/server/schema/`.
2. `pnpm db:generate` → review the emitted SQL in `drizzle/`.
3. `pnpm db:migrate` against a local Postgres.
4. `pnpm db:check-sync` → must pass.
5. Update consumers (queries, the affected `## Code notes` section, feature specs).
6. Full `pnpm test` (DB suites against local Postgres).
7. If a data migration is needed, add it as a script run during deployment —
   see `DEPLOYMENT.md` for the runbook (worker runs `db:migrate` at startup).

## Materialized views

- Rollups (`mv_*`) are defined in the migration `0005` and refreshed
  `CONCURRENTLY` by the nightly cron (ADR-012). Schema changes to the
  underlying tables must be followed by a matching MV redefinition + refresh.
  `mv_*` reads are tenant-filtered in SQL.

## Verification checklist

- [ ] `pnpm db:generate` produced a migration
- [ ] `pnpm db:migrate` applies cleanly on a fresh DB
- [ ] `pnpm db:check-sync` passes
- [ ] No `sql.raw()`, tenant filters present, indexes justified
- [ ] Tests + affected feature spec + `## Code notes` section updated
- [ ] `db:check-sync` green in CI before merge
