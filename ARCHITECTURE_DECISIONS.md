# Architecture Decisions

## ADR-001 — Tenant Isolation: App-Level Scoping (Option B)

**Status:** Active  
**Date:** 2026-06-11  
**Issue:** [#120](https://github.com/Vegm92/mise-en-place-sk/issues/120)

### Context

`drizzle/0002_rls_policies.sql` defines PostgreSQL Row-Level Security (RLS) policies for 17 tables,
using the access model: users reach data through the `user_restaurants` pivot (restaurant_id IN SELECT
from user_restaurants WHERE user_id = auth.uid()::text).

The app connects via `DATABASE_URL` using the `postgres` superuser role, which **bypasses RLS entirely**.
The active tenant boundary is app-level `WHERE restaurant_id = ?` on each query.
Three cross-tenant leaks were found and closed during the P0 audit (see issues #1–#3 in the series).
The RLS file currently gives false confidence.

### Decision

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

`drizzle/0002_rls_policies.sql` is retained as documentation of the intended policy model and as a
future migration target (see Option A path below), but is NOT the active enforcement layer.

### Why not Option A (RLS as real boundary)?

Option A requires:
1. Switching from a direct postgres connection to the **Supabase transaction pooler**.
2. Injecting `SET LOCAL "request.jwt.claims" = '{"sub":"<userId>"}'` per transaction.
3. Infrastructure change to `DATABASE_URL` (pooler connection string format differs).

This is the correct long-term architecture and should be revisited once the pooler migration is planned.

### Consequences

- `tests/tenant-isolation.test.ts` verifies that `forTenant(rid).scope()` cannot surface data from a
  different tenant, satisfying the "automated proof" requirement from issue #120.
- New query code MUST use `forTenant()` for any table with a `restaurant_id` column.
- Direct `db.select().from(tenantTable)` without `forTenant()` scoping is a code review red flag.
- When the app migrates to the transaction pooler, this ADR can be superseded by enabling real RLS
  and removing the app-level `forTenant` requirement.
