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

---

## ADR-002 — Durable Extraction Pipeline: pg-boss + upload_sessions state machine

**Status:** Active  
**Date:** 2026-06-11  
**Issue:** [#121](https://github.com/Vegm92/mise-en-place-sk/issues/121)

### Context

The previous design called Gemini synchronously inside the SvelteKit page `load()` function,
blocking requests for 15–45 seconds, losing work on container recycle, and re-billing Gemini
on every navigation. A dead `pending_processed_invoices` flow existed in the schema but nothing
ever wrote to it.

### Decision

**One flow**: pg-boss (Postgres-backed job queue) + `upload_sessions` as the state machine.

```
uploaded → queued → extracting → done | failed
```

1. **Upload confirms** (`/confirm/[id]` → `extract` action):  
   Sets `session.extractionStatus = 'queued'`, enqueues a `extract-invoice` pg-boss job  
   with `{ sessionId, restaurantId }`, and immediately redirects to `/extract/[id]`.

2. **Worker** (`npm run worker` / `node build/worker.js`):  
   Listens for `extract-invoice` jobs. On pickup, sets status `'extracting'`, calls Gemini,  
   runs the unit bridge, and writes enriched `extractedData` + `conversionNotes` back to the  
   session with status `'done'`. On any error, writes `'failed'` + error key instead.

3. **Extract page** (`/extract/[id]`):  
   - `queued`/`extracting` → returns a loading state; the Svelte page polls  
     `/api/extraction-status/[id]` every 3 s and calls `invalidateAll()` when done.  
   - `failed` → shows the error card with a link back to confirm (to re-trigger).  
   - `done` → returns extracted data for the review/save form (same as before).

4. **Deleted**:  
   - `pending_processed_invoices` and `pending_line_items` tables  
   - `/pending/[id]` route  
   - `/api/inference-status/[id]` endpoint  
   - Inline `extractInvoice()` call inside `load()`  
   - In-process semaphore (`tryAcquireExtraction` / `releaseExtraction`)

### Running the worker

```sh
# Development (resolves $lib aliases via Vite):
npm run worker

# Production (after vite build):
node build/worker.js
```

All web-process env vars are required; the worker reads them from `process.env` / `.env`.

### Consequences

- Uploads return instantly; the user sees a spinner while the worker runs off-request.
- Extraction errors are persisted on the session (`extractError` key); users can retry.
- Container restarts during extraction leave the session in `'extracting'` state. An operator
  can reset stuck sessions (`UPDATE upload_sessions SET data = jsonb_set(...) WHERE ...`).
  Future work: a cron/scheduled job to re-queue sessions stuck in `'extracting'` for > 5 min.
- `env.ts` and `db.ts` now read from `process.env` directly (not `$env/dynamic/private`) so
  they can be imported by the worker without the Vite transform pipeline. This is semantically
  identical at runtime with `adapter-node`.
