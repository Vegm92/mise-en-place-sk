# Feature Spec — Invoice Ingestion (upload → batch)

## Purpose

Turn uploaded invoice documents into a reviewable batch for extraction. This is
the front door of the pipeline (web and WhatsApp converge here).

## Actors

- Signed-in member of the active restaurant (web upload).
- Owner-paired phone number (WhatsApp; see `whatsapp.md`).

## Preconditions

- `locals.restaurantId` set (web) or phone resolved to a tenant (WhatsApp).
- `getAccessState()` allows access (trial not expired / sub active).
- Monthly extraction quota has headroom (checked at upload).
- `GEMINI_API_KEY` present or the item can route to XML parsing.

## Inputs

- One or more files: `.pdf`, `.jpg`, `.jpeg`, `.png` (web). `.xml` e-invoices
  are not accepted through the web upload path.
- Per-file rate limit `upload:{rid}` 10/min.

## Outputs

- `upload_batches` row + one `batch_items` row per file (`status='pending'`,
  `position` 1..n, `fileKey`).
- Files persisted in storage (`storage.ts`).
- pg-boss jobs enqueued (`extract-invoice`, `singletonKey: itemId`).

## Business rules

- Extension whitelist + **magic-byte** validation (PDF `%PDF-`, JPEG `FF D8 FF`,
  PNG signature); mismatch → `contentMismatch` rejection (`sessions.ts:9-58`).
- 20 MB cap (`MAX_FILE_BYTES`).
- File keys `{namespace}/{stem}_{3-hex-suffix}{ext}`; namespace is random hex.
- `enqueueBatchExtraction` walks items: `pending|failed → markQueued + enqueue`;
  `queued → enqueue` only (idempotent). Per-file rejects do not fail the batch.
- Billing gate + quota compare happen before storage (fail fast).

## State transitions

```
pending ──markQueued──▶ queued ──(worker)──▶ extracting ──markDone──▶ done
   ▲                                            │
   └──────markFailed (queued|extracting)────────┘
```
Guarded `UPDATE ... WHERE status IN (...)` — a web/worker race is a no-op
(`batch-core.ts:177-225`).

## Data dependencies

`upload_batches`, `batch_items`, `settings` (quota), `subscriptions`
(access), storage.

## API dependencies

- `(app)/+page.server.ts` `upload` action.
- `(app)/api/batch-status/[id]/+server.ts` (client polls every 2.5 s).
- `api/upload/[id]/[file]/+server.ts` (preview iframe; path-traversal guarded).

## UI dependencies

`(app)/+page.svelte` (upload dropzone + progress), `UploadPanel.svelte`,
`batch/[id]/+page.svelte`.

## Background dependencies

`extract-batch.ts` → `queue.ts` (pg-boss). Worker must be running or items stay
`queued`; see `docs/05_operations/background_jobs.md`.

## External dependencies

None at ingest time beyond storage; extraction is the next stage
(`invoice_extraction.md`).

## Validation

Extension, size, magic bytes, quota, rate limit, tenant access.

## Error states

- `contentMismatch` (bad magic bytes).
- Quota exceeded / trial expired / subscription inactive → upload blocked.
- Rate limited (429).
- Per-file failure → partial batch; remaining items still processed.

## Edge cases

- Mixed valid/invalid files in one upload.
- Duplicate file uploaded twice — extracted twice before the save-time
  content-hash gate (known gap).
- Upload while quota is nearly exhausted — some files accepted, later ones fail.
- Worker down — items stuck `queued`, batch page polls.

## Security rules

- Tenant scoping on every batch/upload query.
- Path-traversal guards on file reads; magic-byte validation before persist
  (ADR-016).

## Idempotency rules

- `singletonKey: itemId` prevents duplicate pg-boss enqueues.
- Re-enqueuing an already-`queued` item is a safe no-op.
- Two identical files are not deduped at upload (see edge cases).

## Observability

- Extraction status is pollable; failures recorded on `batch_items.extractError`
  and (after retries) routed to the dead-letter queue.

## Acceptance criteria

- Uploading N valid files creates 1 batch + N items, all `pending` then
  `queued`, and N pg-boss jobs exist.
- A magic-byte mismatch rejects the file without a DB row.
- Tests: `tests/upload-validation.test.ts`, `tests/upload-endpoint.test.ts`,
  `tests/batch-model.test.ts`, `tests/queue-depth.test.ts`.

## Code notes

### `src/routes/api/batch-status/[id]/+server.ts`

**`const GET`**

- Single poll endpoint for the batch page — every item's real status. The only feedback channel the UI uses; no client-side simulated progress anywhere.

**`property status`**

- `pending` reads as queued once extraction was requested; the page only polls while something is in flight.

**`property stalled`**

- Crossing the stall threshold changes no item's status, so a status-only response would leave the page polling forever with nothing to react to (#540). The flag is what the client diffs to trigger `invalidateAll`.
- The poll is also where the hard timeout is enforced for a page left open: reap first, then report, so the response already carries the reaped `failed` state instead of one poll's worth of stale spinner.

### `src/lib/server/batch.ts`

**`type BatchDb`**

- Batch data layer — the single owner of batch_items state. Every transition is a guarded UPDATE (`WHERE status IN (…)`) reporting whether it fired; stale/duplicate requests become no-ops, never lost updates; callers never read-modify-write.
- Ownership split: web calls createBatch/addItems/markQueued/markConfirmed/markDiscarded/removeItem/requeueStalled/failStalledItems; worker calls markExtracting/markDone/markFailed; neither writes the other's transitions. Factory over an injected drizzle instance so tests run real SQL; the module-level bindings at the bottom of the file are the production instance over the app connection. Accepts a transaction (guarded transition inside an enclosing db.transaction, e.g. invoice save + item confirm #248).

**`const UUID_RE`**

- Route params land unvalidated; a non-UUID (e.g. legacy session id) would make Postgres throw on the uuid cast (22P02).

**`function stallLevel`**

- The stall clock is `queued_at`, not `updated_at`: `updated_at` moves on every transition, so a queued→extracting hop would silently reset the very timer that is supposed to measure the whole wait (#540).
- A NULL `queued_at` is never stalled — rows written before migration 0042 have no clock, and inventing one from `created_at` would fail a batch the user never even submitted.

**`function failStalledItems`**

- The hard timeout runs in the **web** process, on batch reads, precisely because the failure it exists for is "the worker is not running" — a worker-side sweeper would be down at the same time (#540, #501).
- Writes only `status` + `extract_error`, the columns the worker would have written itself, so a late-returning worker loses its result to the guarded transition rather than resurrecting a row the user has already been told is failed.

**`function requeueStalled`**

- Retrying a *stalled* item cannot go through `markQueued`, which only accepts `pending`/`failed`. Going `queued|extracting → failed → queued` keeps every state change inside the guarded transitions and restarts `queued_at`, so the user's retry gets a full fresh window rather than one that is already expired.

**`function pickActiveItem`**

- The item a review UI should surface: first reviewable (`done`) open item, else first failed; null while everything is pending/in flight.

**`function addItems`**

- Appends items, continuing the position sequence.

**`function getBatchItems`**

- All items in position order (including confirmed/discarded).

**`function nextReviewableItem`**

- Next item needing attention (not confirmed/discarded), preferring after `afterPosition`, then wrapping.

**`function removeItem`**

- Deletes outright — only allowed before extraction starts.

**`function deleteBatch`**

- items cascade.

**`function transition`**

- Guarded transitions.

**`function markQueued`**

- Web: pending/failed → queued (re-queueing a failed item is the retry path).

**`function markExtracting`**

- Worker: queued → extracting.

**`function markDone`**

- Worker: extracting (or queued, if the extracting write raced) → done.

**`function markFailed`**

- Worker: queued/extracting → failed.

**`function markConfirmed`**

- Web: done → confirmed (invoice saved).

**`function markDiscarded`**

- Web: any non-terminal state → discarded.

**`function isBatchSettled`**

- True when no item still needs attention.

**`function cleanupStaleBatches`**

- Only non-confirmed items' files are ours to delete — a confirmed item's file becomes the invoice's `source_file` and must survive until the invoice's own retention purge (`runFilePurgeJob`).

**_module level_**

- The exports at the bottom are `createBatchStore(db)` bound to the app connection. The store is a DI factory rather than a set of bare functions so the guarded SQL runs for real against the test database instead of being mocked.

### `src/lib/server/sessions.ts`

**`const ALLOWED_EXTENSIONS`**

- Upload file helpers — validation, storage-key generation, local-path resolution. Batch/queue state lives in batch.ts; the legacy JSON-blob session store is gone (the file keeps its name from that era).

**`function uploadsDir`**

- Local uploads directory — local storage driver + file stat display.

**`interface RejectedUpload`**

- Save via the configured storage driver; returns saved (display names + uniqueness suffix), keys (`namespace/filename`), errors. Rejection reason is an i18n key the page translates (#294), not prose: unsupportedType | tooLarge | contentMismatch.

**`function localFilePath`**

- Local path for a storage key under the local driver; used only for file stat display on the batch page.

### `src/lib/server/storage.ts`

**`method delete`**

- Ignore errors — the object may already be gone.

### `src/lib/components/UploadPanel.svelte`

**`const localError`**

- Client-side problems (oversized file, offline queue full, failed upload) used to go through native alert() — modal, unstyled, wrong locale, invisible to the page. Now feed the same banner as server errors (#233); transient ones clear themselves.

**`const serverError`**

- Server actions return i18n keys, not prose (#294); `$t` falls back to the key itself, so an unexpected string still renders.

**`const DB_NAME`**

- IndexedDB helpers — offline queue DB `mise-offline-queue`.

**`function removeFromOfflineQueue`**

- ignore.

**`function addFiles`**

- File helpers.

**`function openCamera`**

- Camera opens straight away — the framing tip used to be a blocking bottom sheet before the first capture, the worst moment to read it; it now rides as a caption on the photo-confirm overlay where "retake" is a real option (#230).

**`function uploadWithProgress`**

- Upload with progress and offline fallback; the action's payload carries an i18n key + vars (#294).

**`function doUpload`**

- Client-side navigation keeps the app shell intact — a hard reload re-runs every layout query for nothing.

**`const onOnline`**

- Lifecycle.

**`markup`**

- Mobile + desktop variants (md breakpoint); 3-step indicator shared with /batch/[id] (#232); alerts; offline banner; upload zone; camera + browse buttons; hidden file input; file queue; sticky extract button; camera input always in DOM. Mobile overlays: preview + framing tip folded in from the old pre-capture sheet (#230).
