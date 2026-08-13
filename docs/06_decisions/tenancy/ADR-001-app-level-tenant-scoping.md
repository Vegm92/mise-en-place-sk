# ADR-001 — Tenant Isolation: App-Level Scoping (Option B)

**Status:** Active — amended by [ADR-005](./ADR-005-rls-retired.md)  
**Feature:** Tenancy  
**Date:** 2026-06-11  
**Issue:** [#120](https://github.com/Vegm92/mise-en-place-sk/issues/120)

> **Amendment (2026-08-03, ADR-005).** The decision below is unchanged and still
> active. Two things about it are not: `drizzle/0001_rls_policies.sql` no longer
> contains any policies (#373 dropped them for the Railway migration), and
> "Option A" as written below routes through Supabase infrastructure that no
> longer exists in this stack. The database-enforced path is still open, but via
> a different route — see the rewritten *Why not Option A* section and #222.

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

