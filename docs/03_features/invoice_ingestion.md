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
