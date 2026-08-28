# ADR-001 — Tenant Isolation: App-Level Scoping (Option B)

**Status:** Active — amended by [ADR-005](./ADR-005-rls-retired.md) and [#517](https://github.com/Vegm92/mise-en-place-sk/issues/517)  
**Feature:** Tenancy  
**Date:** 2026-06-11  
**Issue:** [#120](https://github.com/Vegm92/mise-en-place-sk/issues/120)

> **Amendment (2026-08-03, ADR-005).** The decision below is unchanged and still
> active. Two things about it are not: `drizzle/0001_rls_policies.sql` no longer
> contains any policies (#373 dropped them for the Railway migration), and
> "Option A" as written below routes through Supabase infrastructure that no
> longer exists in this stack. The database-enforced path is still open, but via
> a different route — see the rewritten *Why not Option A* section and #222.

> **Amendment (2026-08-27, #517).** `forTenant().scope()` proves a *query* is
> shaped correctly; it says nothing about whether the *action* running that
> query should have been allowed to run at all. Two cross-tenant bugs — a batch
> action that called a correctly-scoped store function with the wrong tenant's
> id, and a remove action that ran a correctly-formed delete outside the branch
> that had checked ownership — passed every query-shape lint because the query
> itself was fine; the missing thing was an authorization check on the action.
> See *Action-level authorization* below, added below the query-level model
> this ADR otherwise still describes unchanged.

## Context

`drizzle/0001_rls_policies.sql` defines PostgreSQL Row-Level Security (RLS) policies for 17 tables,
using the access model: users reach data through the `user_restaurants` pivot (restaurant_id IN SELECT
from user_restaurants WHERE user_id = auth.uid()::text).

The app connects via `DATABASE_URL` using the `postgres` superuser role, which **bypasses RLS entirely**.
The active tenant boundary is app-level `WHERE restaurant_id = ?` on each query.
Three cross-tenant leaks were found and closed during the P0 audit (see issues #1–#3 in the series).
The RLS file currently gives false confidence.

## Decision

**Option B: single app-level enforcement via `forTenant(restaurantId)`.**

All route handlers MUST obtain a tenant context via:

```typescript
import { forTenant } from '$lib/server/db';

const tdb = forTenant(locals.restaurantId);
const rows = await db.select().from(suppliers).where(tdb.scope(suppliers.restaurantId));
```

The `forTenant()` call throws if `restaurantId` is empty, making it impossible to accidentally run
a tenant query without a scope. The `scope()` helper injects the `WHERE restaurant_id = ?` condition,
with an optional second argument for composing additional conditions.

Non-tenant tables (`waitlist`, `upload_sessions`, `subscriptions`, `restaurants`) continue to use `db`
directly — they are not scoped to a restaurant.

~~`drizzle/0001_rls_policies.sql` is retained as documentation of the intended policy model and as a
future migration target (see Option A path below), but is NOT the active enforcement layer.~~
**Superseded by ADR-005:** the file now drops policies rather than defining them, so it no longer
documents the model. The model as originally written is preserved in this ADR's git history.

## Why not Option A (RLS as real boundary)?

**Original reasoning (2026-06-11), no longer applicable.** Option A was scoped to Supabase: switch
from a direct postgres connection to the **Supabase transaction pooler**, inject
`SET LOCAL "request.jwt.claims" = '{"sub":"<userId>"}'` per transaction, and change `DATABASE_URL`
to the pooler format. On Railway Postgres there is no such pooler and no `auth.uid()`, so this
particular route is closed.

**Current path (2026-08-03).** Database-enforced isolation is still achievable, and #373 did not
close it — it only removed policies that were keyed to Supabase's Data API. The remaining route
is provider-neutral and described in [#222](https://github.com/Vegm92/mise-en-place-sk/issues/222):

1. Run the app through a dedicated **non-owner** Postgres role. Table owners bypass RLS, which is
   why the old policies never protected the SSR path even while they existed.
2. `ALTER TABLE … FORCE ROW LEVEL SECURITY` so policies apply to that role.
3. Set the tenant context per transaction — `SET LOCAL app.restaurant_id = …` — and write policies
   against `current_setting('app.restaurant_id')` rather than `auth.uid()`.

Railway arguably makes this easier than Supabase did, since role management is fully under our
control. The policies would need writing fresh against a session variable, not porting from the
`auth.uid()` versions. Still the correct long-term architecture; still not scheduled.

## Consequences

- `tests/tenant-isolation.test.ts` verifies that `forTenant(rid).scope()` cannot surface data from a
  different tenant, satisfying the "automated proof" requirement from issue #120.
- New query code MUST use `forTenant()` for any table with a `restaurant_id` column.
- Direct `db.select().from(tenantTable)` without `forTenant()` scoping is a code review red flag.
- ~~When the app migrates to the transaction pooler, this ADR can be superseded by enabling real RLS
  and removing the app-level `forTenant` requirement.~~ Amended by ADR-005: if #222 is taken up, the
  supersession would come from a non-owner role plus `FORCE ROW LEVEL SECURITY`, not from a pooler.
- Since ADR-005, app-level scoping is the **only** tenant boundary rather than the active one of two.
  `tests/tenant-isolation.test.ts` and `lint:tenant-scope` are therefore load-bearing, not
  belt-and-braces — see #380.

## Action-level authorization (#517)

`forTenant().scope()` and `lint:tenant-scope`/`lint:unscoped-query` prove a **query** is shaped
correctly — it names a restaurant and filters by it. None of that proves the **action** running the
query should have been allowed to run in the first place. An action that resolves an id from
`params` or form data (a batch id, a supplier id, a restaurant id other than the caller's own) and
then hands it to a correctly-scoped query is still a cross-tenant bug if nothing first checked that
the caller owns that id — the query is shaped fine, it was just asked to touch the wrong row on
purpose. Two such bugs shipped and passed every existing lint before this was written.

The additional rule, enforced by `pnpm lint:action-authz` (`scripts/lint-invariants.mjs`,
`action-authz` gate) over every exported action in `src/routes/(app)/**/+page.server.ts`:

- An action whose body mutates a tenant table (`db`/`tx` `.insert()`/`.update()`/`.delete()`, or a
  raw `.execute()` with an `INSERT`/`UPDATE`/`DELETE` against one) must, before or regardless of that
  mutation, do one of:
  1. Call a **known guard** — `requireOwnedBatch`, `requireOwner`, and any name added to
     `KNOWN_AUTHZ_GUARDS` at the top of the gate as new ones are introduced — that checks the caller
     owns the resolved id.
  2. Scope every mutation itself, via `forTenant()`/`.scope()` in the same action body. An action
     whose only externally-resolved id is `locals.restaurantId` — never a batch id, supplier id, or
     other id read from `params`/form data — is authorized by construction; requiring a redundant
     named guard on top of that would be noise, not safety.
  3. Carry an explicit `// tenant-check-ok: <reason>` comment (same convention as
     `tenant-scope-ok`), for the cases that are safe but don't fit the two shapes above — e.g. an
     `INSERT` that creates a new row under the caller's own tenant, where there is no existing row to
     check ownership of.
- The gate reasons about **source text within one action's own body**, the same level of rigor
  `tenant-scope` and `unscoped-tenant-query` already work at — it does not follow calls into helper
  functions, imported or same-file. An action that delegates its mutation entirely to an imported
  store function (e.g. every `/batch/[id]` action calling into `$lib/server/batch.ts`) is invisible
  to this gate; those files are safe because the imported functions are themselves `forTenant()`-
  scoped and the route additionally calls `requireOwnedBatch` as a defense the gate cannot demand.
  Closing that reach gap would mean tracing a call graph, which is a different, heavier tool than
  this project's lints have ever been — false negatives here are the accepted tradeoff for a lint
  that runs in milliseconds with no parser.
- Consistent with `tenant-scope-ok`, the policy on doubt is to **allow with an escape comment**: the
  gate's value is making the authorization decision explicit and reviewable, not blocking every
  pattern it cannot itself verify as safe.

