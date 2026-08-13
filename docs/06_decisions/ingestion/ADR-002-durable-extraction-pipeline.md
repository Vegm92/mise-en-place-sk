# ADR-002 — Durable Extraction Pipeline: pg-boss + upload_sessions state machine

**Status:** Active  
**Feature:** Ingestion  
**Date:** 2026-06-11  
**Issue:** [#121](https://github.com/Vegm92/mise-en-place-sk/issues/121)

## Context

The previous design called Gemini synchronously inside the SvelteKit page `load()` function,
blocking requests for 15–45 seconds, losing work on container recycle, and re-billing Gemini
on every navigation. A dead `pending_processed_invoices` flow existed in the schema but nothing
ever wrote to it.

## Decision

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

## Running the worker

```sh
# Development (resolves $lib aliases via Vite):
npm run worker

# Production (after vite build):
node build/worker.js
```

All web-process env vars are required; the worker reads them from `process.env` / `.env`.

## Consequences

- Uploads return instantly; the user sees a spinner while the worker runs off-request.
- Extraction errors are persisted on the session (`extractError` key); users can retry.
- Container restarts during extraction leave the session in `'extracting'` state. An operator
  can reset stuck sessions (`UPDATE upload_sessions SET data = jsonb_set(...) WHERE ...`).
  Future work: a cron/scheduled job to re-queue sessions stuck in `'extracting'` for > 5 min.
- `env.ts` and `db.ts` now read from `process.env` directly (not `$env/dynamic/private`) so
  they can be imported by the worker without the Vite transform pipeline. This is semantically
  identical at runtime with `adapter-node`.

