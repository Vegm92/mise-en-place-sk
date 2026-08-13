# ADR-005 — Railway Postgres: RLS Retired, App-Layer Scoping Is The Boundary

**Status:** Active  
**Feature:** Tenancy  
**Date:** 2026-08-03  
**Issues:** [#366](https://github.com/Vegm92/mise-en-place-sk/issues/366), [#368](https://github.com/Vegm92/mise-en-place-sk/issues/368), [#376](https://github.com/Vegm92/mise-en-place-sk/issues/376), [#377](https://github.com/Vegm92/mise-en-place-sk/issues/377)

## Context

Nine migrations enabled row-level security. Every one of them did so for the same reason: to gate
**Supabase's Data API** (PostgREST), reached with the public anon key. The policies were written
against `auth.uid()`, a function that exists only because of Supabase's GoTrue integration. Tables
with no user-facing policy were enabled-with-no-policies, i.e. deny-all to that same API.

None of this ever constrained the application. The app reaches Postgres over a direct connection as
the table-owning role, and **table owners bypass RLS** unless `FORCE ROW LEVEL SECURITY` is set. That
was ADR-001's finding in June and #222's in July: the policies were defense-in-depth on a door the
app never used, and the real boundary was `forTenant().scope()` in query code.

The Railway migration (#366) forced the question. Railway Postgres has no Data API and no
`auth.uid()`, so replaying the migrations as written failed outright — the policies could not even be
created. The options were to port them to a session variable, or to drop them.

A confirming detail: the app makes **no** Data API calls. `src/lib/server/supabase.ts` is used only
for GoTrue auth — there is not a single `.from()` or `.rpc()` data query in `src/`. Even `waitlist`,
the one table with a public-facing INSERT policy, is written through Drizzle's owner connection in
`waitlist-db.ts`. So the policies gated a path with no callers.

## Decision

**Drop the RLS policies rather than port them.** #373 rewrote all nine migrations to `DISABLE ROW
LEVEL SECURITY` / `DROP POLICY`, and #374 retired `tests/rls-enforcement.test.ts`, which proved a
property of the Data API path that no longer exists.

`forTenant().scope()` (ADR-001) is now the **only** tenant boundary, guarded by `lint:tenant-scope`
in CI. This is a change in candour rather than in security posture: the app was always relying on
app-layer scoping alone, and the RLS files gave a second layer that only appeared to exist.

Editing the nine shipped migrations in place, rather than adding a forward migration, was deliberate.
Drizzle selects migrations by journal timestamp, so edits do not re-run against an already-migrated
database; the rewrite therefore only affects fresh replays, which is exactly the Railway case. The
consequence to remember is that the **old Supabase database still has RLS enabled and its policies
intact** — the two environments differ, and a `pg_dump` from Supabase restored into Railway would
carry policies referencing an `auth.uid()` that is not there.

## Consequences

- `drizzle/0001_rls_policies.sql` does the opposite of its filename. The journal tag is immutable, so
  the name stays; the header comment explains it.
- The deploy and sign-off runbooks now assert **zero** policies and **zero** RLS-enabled tables as the
  expected post-migration state (#376). Previously they failed the deploy when policies were absent.
- `scripts/ci-db-setup.sql`, which stubbed `auth.uid()` so migration 0001 could apply to a plain
  Postgres container, was removed along with its CI step (#378) — nothing references `auth.uid()` now.
- Tenant-isolation tests and the lint gate become load-bearing rather than supplementary. Both are
  thinner than that role warrants; #380 tracks strengthening them.
- Database-enforced isolation remains open via #222, on a provider-neutral route: a non-owner role,
  `FORCE ROW LEVEL SECURITY`, and policies written against `SET LOCAL app.restaurant_id`. This ADR
  does not close that door — it removes the artifact that made it look already half-open.

## Verification

Full `drizzle-kit migrate` replay from empty against Postgres 16: 32 tables, 5 materialized views,
`pg_trgm` plus the `mep_norm_key` / `refresh_analytics_rollups` functions present, **0** policies,
**0** RLS-enabled tables, and no `auth` schema required.
