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

---

## ADR-003 — Drizzle Workflow: Committed Migrations Are Canonical

**Status:** Active  
**Date:** 2026-08-02  
**Issue:** [#345](https://github.com/Vegm92/mise-en-place-sk/issues/345)

### Context

`drizzle/` holds 26 committed SQL migration files, but `CONTEXT.md`'s dev-commands section
described `pnpm db:push` as "the dev workflow — no migration files," which reads as if migration
files are vestigial. They are not:

- `drizzle/0001_rls_policies.sql` defines the RLS policies ADR-001 references. RLS policies are
  raw SQL, not part of `schema.ts` — `db:push` diffs against `schema.ts` only, so it **cannot**
  apply or re-apply them.
- `ci.yml` already runs `pnpm db:migrate` to bootstrap the ephemeral CI Postgres before tests.
- `DEPLOYMENT.md` and `PRODUCTION_SIGNOFF.md` document `pnpm db:migrate` as the staging/production
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

### Decision

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

### Consequences

- A PR that edits `schema.ts` without running `pnpm db:generate` fails CI at the "drizzle/ in sync
  with schema.ts" step, with a message telling the author what to run.
- `db:push` remains available and documented for local iteration speed, but is explicitly scoped
  to dev-only in `CONTEXT.md` and this ADR — it is not a deploy mechanism.
- `drizzle/meta/0000_snapshot.json`–`0021_snapshot.json` remain absent; no backfill is needed
  since drizzle-kit's diffing only depends on the latest snapshot in the chain.
- `docs/ARCHITECTURE_DECISIONS.md` is now tracked in git (previously gitignored by accident).

---

## ADR-004 — WhatsApp Ingestion Converges on the Batch Upload Pipeline

**Status:** Active  
**Date:** 2026-08-02  
**Issue:** [#348](https://github.com/Vegm92/mise-en-place-sk/issues/348)

### Context

WhatsApp invoice intake runs its own parallel state machine — `whatsapp_bot_sessions`
(`status: awaiting_confirmation → confirmed | discarded`, 1h TTL) driven by
`whatsapp-bot.ts` — instead of feeding the `upload_batches`/`batch_items` pipeline the
web upload flow uses (ADR-002). Confirmation today happens **inline over WhatsApp**: the
bot extracts the invoice synchronously in-request, replies with a summary, and waits for
a SÍ/NO text reply. On SÍ, `saveWhatsAppInvoice` runs its own transaction: supplier
upsert, content-hash dedup, invoice-number dedup, and a raw `INSERT INTO
invoice_line_items` — hardcoding `requiresUnitConversion: 0, canonicalUnit: null` on
every line.

This means two independent invoice-creation pipelines exist, and they've already
diverged: the unit bridge (`products.ts`: `resolveUnit`, `parsePack`,
`normalizedUnitPrice`) and the alert engine (`alerts.ts`: price-shock, stock-forecast,
budget-check, categorization) only run inside `invoice-save.ts`'s `saveReviewedInvoice`,
which only the `/batch/[id]` review page calls. Every invoice submitted via WhatsApp
silently skips both. `docs/APP_AUDIT.md` (local-only, gitignored) documented this same
divergence pattern for the previous `pending_invoices` design before ADR-002 replaced
it — this is a recurring gap, not a one-off, and the fix this time should close the
pipeline fork rather than move it.

### Decision

**WhatsApp becomes an ingestion channel that hands off to the existing web review
screen for confirmation.** A WhatsApp inbound message with an invoice attachment creates
an `upload_batches` row + one `batch_items` row via `batch-core.ts` (reused, not
reimplemented), flows through the same extraction worker (`extraction-worker.ts`,
`annotateLineItems` unit bridge included), and the bot's reply becomes a link to
`/batch/[id]` instead of an inline extracted-data summary. Confirming, discarding, and
retrying all happen on the existing web page — `saveReviewedInvoice` (unit bridge +
alert engine included) is the only invoice-creation code path going forward. The
SÍ/NO inline handshake is retired for the new path.

**Cutover: dual-run bake period, gated by a feature flag.** No existing mechanism for
this exists in the codebase (checked: no flags table, no config abstraction — just
`env.ts` constants). A new boolean env var (e.g. `WHATSAPP_USE_BATCH_PIPELINE`,
following the existing `env.ts` pattern) selects old vs. new path per inbound message,
default **off** in prod until verified. In-flight `whatsapp_bot_sessions` rows already in
`awaiting_confirmation` are left alone — they keep resolving on the legacy
`handleTextReply` handler until confirmed, discarded, or their existing 1h TTL expires.
No forced migration or abandonment of in-flight sessions. Once the new path is verified
in prod, a follow-up issue removes the flag and the legacy `whatsapp_bot_sessions`
code path (`handleMediaUpload`'s synchronous extraction, `handleTextReply`,
`saveWhatsAppInvoice`).

### Consequences

- `whatsapp-bot.ts`'s webhook entrypoint (`src/routes/api/whatsapp/webhook/+server.ts` →
  `handleWhatsAppMessage`) gains a flag-gated branch: new path creates a batch/item and
  replies with a `/batch/[id]` link; old path is untouched by this decision and keeps
  running exactly as today for the bake period.
- Dedup logic (`dedup.ts`'s `computeInvoiceContentHash`) stays duplicated at two call
  sites (`whatsapp-bot.ts` legacy path, `invoice-save.ts`) only until the legacy path is
  removed post-bake; the new path uses `invoice-save.ts`'s copy exclusively, closing the
  divergence for good going forward.
- The inline SÍ/NO confirmation UX is a deliberate regression for WhatsApp users on the
  new path (an extra tap/link vs. a same-chat reply) traded for pipeline convergence;
  not revisited in this ADR.
- Existing tests (`whatsapp-bot.test.ts`, `whatsapp-webhook.test.ts`,
  `whatsapp-api.test.ts`) must keep passing unmodified for the legacy path; new tests
  cover the bridge path added under the flag. See issue #349.
- Follow-up issue (opened after prod verification) removes the flag and deletes the
  legacy `whatsapp_bot_sessions` state machine, `handleMediaUpload`'s inline extraction,
  `handleTextReply`, and `saveWhatsAppInvoice`.

### Update — cutover complete (issue #350)

`WHATSAPP_USE_BATCH_PIPELINE` and the legacy `awaiting_confirmation` state machine
(`handleTextReply`, `saveWhatsAppInvoice`, `getPendingSession`, the inline synchronous
extraction in `handleMediaUpload`) are deleted. The batch-bridge path is now the only
path. `whatsapp_bot_sessions` is dropped (migration `0026_drop_whatsapp_bot_sessions.sql`).
The other four WhatsApp tables (`whatsapp_contacts`, `whatsapp_pairing_codes`,
`whatsapp_processed_messages`, `whatsapp_account_events`) serve purposes independent of
the session/confirmation machine — contact directory, onboarding, webhook-redelivery
dedup, and Meta account health — and were kept as-is.
