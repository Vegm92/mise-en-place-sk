---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

# Database Change Procedure

How to change the schema safely. The migration is the artifact of record, not
the schema file (ADR-003).

## Canonical sources

- Drizzle schema in `src/lib/server/schema.ts` — one file, 40 tables.
- Committed migrations in `drizzle/` (latest: `0081_*.sql`).
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
  A new **foreign key** also needs an index leading on its own column (#996):
  Postgres indexes the referenced side, never the referencing one, so without it
  every cascade and every read by that key is a sequential scan. A composite
  index counts only when the FK column comes first, and a partial one only when
  its predicate cannot exclude a referencing row.
- **Naming**: snake_case plural tables, singular columns; statuses default
  `pending`/`active`-style.
- **Column type changes**: `db:generate` emits a bare
  `ALTER COLUMN ... SET DATA TYPE x`. Postgres aborts that whenever no implicit
  cast exists (e.g. `text` → `uuid`), so hand-add the `USING` clause to the
  generated SQL. Keep the cast strict rather than filtering bad rows: it then
  fails loudly and rolls the migration back instead of converting partially
  (migration 0038).
- **Existing-data migrations**: write them idempotently (guards + `WHERE` on
  current state); never hardcode generated ids. Data migrations run with the
  schema ones, in the web service's pre-deploy `pnpm db:migrate` (the worker
  only waits for that step — `build/wait-for-migrations.js`).

## Expand / contract (issue #1009)

**A migration that drops or retypes a live column may not ship in the same
deploy as the code that stopped using it.**

Both services migrate as a Railway **pre-deploy** step — web runs
`pnpm db:migrate` (`railway.json:11-13`), the worker waits for it
(`railway.worker.json:12-14`). The schema therefore changes *before* the new
container serves, while the **old** one is still handling requests against it.
Ship both halves at once and every request in that window runs old code against
a schema that no longer matches it.

So a destructive change is two deploys:

| Deploy | Migration | Code |
|---|---|---|
| 1 — expand | additive only: add the new column/table, backfill idempotently | still reads the old shape; may dual-write |
| 2 — switch | none | reads and writes the new shape only |
| 3 — contract | `DROP COLUMN` / `DROP TABLE` / `ALTER COLUMN … TYPE` | unchanged |

Deploys 2 and 3 can be the same PR only if nothing in deploy 2 is still
running when deploy 3's pre-deploy step fires — which is never true here,
because the pre-deploy step runs first by definition. Keep them apart.

A retype is a drop in disguise: `ALTER COLUMN … SET DATA TYPE` rewrites the
column in place, so the old code reads the new type immediately. Expand it the
same way — new column, backfill, switch, drop.

### The CI gate

`pnpm lint:migration-ordering` (`scripts/lint-invariants.mjs`, rule
`migration-expand-contract`, wired in `.github/workflows/ci.yml`) diffs the PR
against its base and reports a migration containing `DROP COLUMN`,
`DROP TABLE` or `ALTER COLUMN … TYPE` in a PR that also edits `src/`.

- **Warning first.** It prints and exits 0, the same way the inline-style
  budget started (#845). The nine destructive migrations already committed
  (`0017`, `0026`, `0032`, `0036`, `0038`, `0039`, `0047`, `0050`, `0074`) were
  all correct by hand, so failing on arrival would mostly teach people to reach
  for the waiver. `--strict` flips it to a hard failure; that is the ratchet.
- **The waiver** is `-- expand-contract-ok: <reason>` in the migration header,
  and it means *the readers were repointed in an earlier deploy* — nothing
  else. `drizzle/0050_drop_upload_sessions_bool_columns.sql:1-15` is exactly
  that case and already explains itself in prose; the directive is the
  machine-readable half. A directive with nothing after the colon does not
  count.
- Comments are stripped before the scan, so a header that *describes* a drop
  is not read as one.

`ADR-003` makes the committed migration canonical and `pnpm db:check-sync`
enforces schema/migration agreement. Neither says anything about *ordering* —
that is what this adds.

Rollback stays manual and forward-fixing: redeploy the previous container,
then correct forward (`docs/04_engineering/deployment.md:103-107`). Expand/
contract is what makes that redeploy survivable — if the contract migration
already ran, the previous container has nothing to roll back to.

## Procedure (Level 4 change — see `docs/07_ai/change_protocol.md`)

1. Edit the relevant file under `src/lib/server/schema/`.
2. `pnpm db:generate` → review the emitted SQL in `drizzle/`.
3. `pnpm db:migrate` against a local Postgres.
4. `pnpm db:check-sync` → must pass.
5. Update consumers (queries, the affected `## Code notes` section, feature specs).
6. Full `pnpm test` (DB suites against local Postgres).
7. If a data migration is needed, add it as a script run during deployment —
   see `DEPLOYMENT.md` for the runbook (the web service's pre-deploy step runs
   `db:migrate`; the worker's pre-deploy step waits for it).

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
- [ ] Nothing destructive in the same PR as the `src/` change that needs it —
      `pnpm lint:migration-ordering --base origin/main` quiet, or the waiver
      present with its reason
