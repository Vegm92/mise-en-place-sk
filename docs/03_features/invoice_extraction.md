# Feature Spec — Invoice Extraction

## Purpose

Turn one batch item into a typed, confident `ExtractedInvoice` (supplier, header
fields, line items with per-field confidence) — via Gemini for PDFs/images, or
the XML parser for structured e-invoices (no AI). VERI\*FACTU QR payloads are
parsed here and re-checked at save.

## Actors

- The worker process (`extraction-worker.ts`), acting on pg-boss jobs.
- The web process only enqueues; it never extracts inline.

## Preconditions

- Batch item `queued` (claimed by `markExtracting`).
- Storage reachable (file pulled to temp for non-local drivers).
- Quota claimable (`claimMonthlyExtraction`, `checkExtractionQuota`).

## Inputs

- `batch_items.id`, `fileKey`; file bytes from storage.
- `GEMINI_MODEL` (default `gemini-2.5-flash`), provider config.

## Outputs

- `batch_items.extracted_data` (typed `ExtractedInvoice`) + `conversion_notes`
  on `done`.
- Enriched `line_items` with `canonical_unit`, `requires_unit_conversion`
  (`annotateLineItems`, `products.ts`).
- On failure: `extractError`, `failed` state, dead-letter entry after retries.
- `monthly_usage`/`llm_usage_log` rows (quota + cost).

## Business rules

- **Classification** (`classifyFile`, `extract.ts:191-200`): `pdf` → unpdf text
  extraction under 15 s; ≥50 chars → `text_pdf` else `scanned_pdf`;
  `jpg/jpeg/png` → `image`; `xml` → `xml`. Else `Unsupported file type`.
- **Routing**: `text_pdf` sends extracted text inline; `scanned_pdf`/`image`
  send base64 inlineData; `xml` → `parseEinvoice` (never Gemini).
- **Retries**: 429/503 retried 3× (1 s/2 s/4 s) + wall-clock timeout
  (`GEMINI_TIMEOUT_MS`, default 60 s) (`withRetry`, `extract.ts`).
- **Timeout cancels the request**: the timeout fires an `AbortController` that
  is threaded into the Gemini call (`config.abortSignal`), so a timed-out
  extraction actually tears down its HTTP request instead of leaking a live
  request that keeps holding a socket and a Gemini concurrency slot. With the
  strictly-sequential worker, leaked requests were the mechanism behind jobs
  piling up during a slow-Gemini spell.
- **JSON**: fence-stripped and `JSON.parse`d; invalid → `notInvoice` error class.
- **Quota first**: `checkExtractionQuota` + `claimMonthlyExtraction` before
  `markExtracting`; release on failure. Errors: `trialExpired`,
  `subscriptionInactive`, `quotaExceeded`.
- **Classify errors**: `rateLimited` (429), `unavailable` (503), `timeout`
  (Gemini timeout), `notInvoice` (bad JSON), else `generic`. Degradation-class
  errors are NOT dead-lettered (retryable).

## State transitions

`queued → extracting → done | failed`. `markExtracting` is a guarded claim — a
lost race releases the quota slot.

## Data dependencies

`batch_items`, `monthly_usage`, `llm_usage_log`, `products` (enrichment),
`settings` (quota overrides), `subscriptions` (access).

## API dependencies

`api/batch-status/[id]` (polling), `(app)/batch/[id]` (review).

## UI dependencies

`batch/[id]/+page.svelte` (status + review), no extraction UI itself.

## Background dependencies

`extract-invoice` queue (pg-boss, retryLimit 2, retryDelay 30 s,
`expireInSeconds` 600). Worker runs `batchSize: 1` sequentially.

## External dependencies

Gemini (`@google/genai` via `llm-provider.ts`); storage driver.

## Validation

Quota, access, classification, JSON shape, error classification.

## Error states

- Quota/access failures (`trialExpired`, `subscriptionInactive`,
  `quotaExceeded`).
- `rateLimited` / `unavailable` / `timeout` (retryable, not dead-lettered).
- `notInvoice` (invalid JSON), `generic`, `corrupt.invalidJson`,
  `corrupt.unknownEinvoiceFormat` (dead-lettered).
- Corrupt job payload (missing `itemId`/`itemNotFound`) → dead-letter directly.

## Edge cases

- Scanned PDF with no text layer (vision path).
- Multi-page PDFs; huge files (20 MB cap upstream).
- XML e-invoice with unknown namespace → `unknownEinvoiceFormat`.
- Unknown unit on a line → flagged `requires_unit_conversion`, saved anyway.

## Security rules

- Tenant-scoped writes (`batch_items`, usage tables).
- Prompt/API key handling via env seam; LLM output treated as data.

## Idempotency rules

- `singletonKey: itemId`; `markExtracting` guarded claim; quota claim is atomic
  (`used < limit`).

## Observability

- Extraction failure classes are countable from `dead_letter_queue` +
  `/admin/dead-letters`; `llm_usage_log` tracks cost.
- Synthetic fixtures for regression testing: `pnpm synth:generate` (local, dev-only).

## Acceptance criteria

- A text-PDF, scanned-PDF, image, and Facturae XML each reach `done` with typed
  data via the correct route.
- 429/503 retries succeed within backoff; a 4th failure marks `failed`.
- Quota exhaustion marks `quotaExceeded` without extracting.
- Tests: `tests/extract.test.ts`, `tests/extract-batch.test.ts`,
  `tests/einvoice-parser.test.ts`, `tests/llm-provider.test.ts`,
  `tests/pdf-text-layer.test.ts`, `tests/dead-letter*.test.ts`.
