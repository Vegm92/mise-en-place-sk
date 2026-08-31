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
- `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), provider config.

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
  (`GEMINI_TIMEOUT_MS`, default 120 s) (`withRetry`, `extract.ts`).
- **Timeout cancels the request**: the timeout fires an `AbortController` that
  is threaded into the Gemini call (`config.abortSignal`), so a timed-out
  extraction actually tears down its HTTP request instead of leaking a live
  request that keeps holding a socket and a Gemini concurrency slot. A
  timed-out request releases its extraction slot in the `finally` around the
  model call, so it never leaves a slot leased.
- **Concurrency slot**: the model call is wrapped in
  `acquireExtractionSlot()` / `slot.release()` (`rate-limiter.ts`), a global
  semaphore capped at `MAX_CONCURRENT_EXTRACTIONS` (default 3). Backed by
  Upstash Redis when configured (distributed, lease/TTL guarded so a dead
  worker can't hold a slot forever), otherwise an in-process fallback.
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

`markQueued` stamps `queued_at`, which is the clock the stall states are read
off (#540): past `EXTRACTION_STALL_WARN_MS` (2 min) an in-flight item is `slow`
and the UI offers Retry; past `EXTRACTION_STALL_TIMEOUT_MS` (15 min)
`failStalledItems` transitions it `queued|extracting → failed` with
`extract.err.stalled`. Retrying a `slow` item goes through `requeueStalled`
(`queued|extracting → failed → queued`), which restarts the clock — plain
`markQueued` only accepts `pending`/`failed`.

- **Allergens** (recipe costing): each line item may carry an `allergens` array
  of the fourteen EU codes. The prompt permits them **only** when the document
  itself prints them (a "Contiene:" note, an allergen column, an icon legend)
  and forbids inferring them from the product name — an allergen declaration is
  a food-safety statement, so a guess is worse than a null. On save they reach
  the resolved product through `applyExtractedAllergens`, which fills only an
  empty set and never a hand-declared one. In practice delivery notes print
  allergens sometimes and nutrition data essentially never, so coverage is
  sparse by design and hand entry stays the primary path.

## Data dependencies

`batch_items` (incl. `queued_at`), `monthly_usage`, `llm_usage_log`, `products`
(enrichment), `settings` (quota overrides), `subscriptions` (access),
`worker_heartbeats` (liveness, read by the health surfaces only).

## API dependencies

`api/batch-status/[id]` (polling), `(app)/batch/[id]` (review).

## UI dependencies

`batch/[id]/+page.svelte` (status + review), no extraction UI itself. Three
in-flight renderings: spinner, the `slow` card (`batch.stalledTitle` /
`batch.stalledBody` + Retry / Discard), and the existing failure card once the
hard timeout fires. The poll invalidates on a status change **or** on a flip of
the `stalled` flag, since crossing the warning threshold changes no status.

## Background dependencies

`extract-invoice` queue (pg-boss, retryLimit 2, retryDelay 30 s,
`expireInSeconds` 600). Worker `batchSize` equals `MAX_CONCURRENT_EXTRACTIONS`
(default 3); a batch of jobs is processed concurrently, with the
`acquireExtractionSlot()` semaphore imposing the true global cap against
Gemini regardless of how many worker processes run. So 3 uploaded invoices
extract in parallel rather than one at a time.

`worker.ts` runs this queue with `perJobResults: true`, so `runExtractionJobForBoss`
(`extraction-worker.ts`) reports each job's own `completed` / `failed` /
`deadletter` disposition rather than the batch settling as one unit — a
rate-limited job in a batch of 3 redelivers on its own; the other two still
settle `completed` (#520).

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
- `stalled` — written by the web process, not the worker: the item sat in
  `queued`/`extracting` past the hard timeout, so no extraction ever ran.
- Corrupt job payload (missing `itemId`/`itemNotFound`) → dead-letter directly.

## Edge cases

- Worker down, crash-looping, or wedged (#501): nothing consumes the queue, so
  the item never leaves `queued`. Caught by the stall clock, not by the worker.
- Rows queued before the `queued_at` migration have a NULL clock and are never
  reaped; migration 0042 backfills the in-flight ones from `updated_at`.
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
- Worker liveness: the `Worker heartbeat` check on `/admin/health` and the
  `worker` block on `/api/health` (`liveness`, `last_seen_at`,
  `last_job_completed_at`, `jobs_completed`) — see
  `docs/05_operations/background_jobs.md`.

## Acceptance criteria

- A text-PDF, scanned-PDF, image, and Facturae XML each reach `done` with typed
  data via the correct route.
- 429/503 retries succeed within backoff; a 4th failure marks `failed`.
- Quota exhaustion marks `quotaExceeded` without extracting.
- With no worker consuming the queue, an item shows the spinner, then the
  actionable "taking longer" state, then the failed state with Retry/Discard —
  it never spins forever (#540).
- Tests: `tests/extract.test.ts`, `tests/extract-batch.test.ts`,
  `tests/batch-stall.test.ts`, `tests/batch-model.test.ts`,
  `tests/worker-heartbeat.test.ts`, `tests/einvoice-parser.test.ts`,
  `tests/llm-provider.test.ts`, `tests/pdf-text-layer.test.ts`,
  `tests/dead-letter*.test.ts`, `tests/extraction-worker.test.ts`.

## Code notes

### `src/routes/(app)/confirm/[id]/+page.server.ts`

**`const load`**

- Legacy route — superseded by /batch/[batchId]; old links carry an item id, resolve to the batch when possible, else home. Inert by design: only pre-ADR-002 survivor, a pure redirect for old email/bookmark links. #441 tracks confirming it's quiet and deleting both — no expiry date otherwise.

### `src/lib/server/einvoice-parser.ts`

**`type EinvoiceFormat`**

- Structured e-invoice parser for Facturae 3.2.x and UBL 2.1 (EN 16931). XML uploads skip Gemini entirely — fields arrive structured at confidence 1.0. Facturae 3.2.2 = Spain national (B2G via FACe, also B2B private); UBL 2.1 = EU standard (EN 16931, mandatory for Spain's SPFE public platform).

**`const parser`**

- Keep attribute values as strings; parse numeric element values. 'Invoice' omitted from `isArray` — the UBL root (always singular), a Facturae child only inside <Invoices> (getArr()).

**`const parser`**

- `skipLike` excludes a leading `+` (e.g. `+34915552233`) — the parser would otherwise coerce it to a number and drop the sign.

**`function getChild`**

- Generic helpers.

**`const FACTURAE_UNIT_CODES`**

- Facturae 3.2.x UnitOfMeasureType, complete per spec (#297): 01 Unidades, 02 Kilos, 03 Litros, 04 Metros, 05 m2, 06 m3, 07 Gramos, 08 Kg (same as 02), 09 t, 10 m/s, 11 L/s, 12 m/s2, 13 m3/s, 14 horas, 15 días, 16 Kwh, 17 Kw, 18 Latas, 19 Centímetros, 20 cm2, 21 cm3, 22 Kilómetros, 23 km2, 24 km3, 25 Docenas, 26 Toneladas (UK), 27 Paquetes, 28 Balas, 29 Cajas, 30 Cientos, 31 Gruesas, 32 Mil unidades, 33 Megawatts, 34 Gigajulios, 35 Megajulios, 36 Kwh/m2. The previous map ('02'→kg, '03'→L, …) didn't match the spec and mislabeled every real Facturae invoice. null = no food-relevant canonical unit — leave empty rather than invent one.

**`function parseFacturae322`**

- Root element may be prefixed (namespace removed) or plain 'Facturae'.

**`property unit`**

- Numeric spec code → canonical unit; literal text ("kg") → canonicalizeUnit. Unknown → null (flagged for conversion), never a fake unit.

**`function parseFacturae322`**

- Payment terms live in PaymentDetails, omitted for Phase 1.

**`function parseUbl21Invoice`**

- Spanish NIF can be in PartyTaxScheme/CompanyID or PartyLegalEntity/CompanyID.

**`const line_items`**

- UN/ECE Rec 20/21 codes (KGM, LTR, C62, XBX…) → canonical unit via the shared synonym map (#297); previously raw codes were lowercased ("kgm") and unrecognised, so every UBL line demanded a manual conversion rule. Unknown → null.

**`type ParsedEinvoice`**

- Public API: `ExtractedInvoice` plus the e-invoice format.

**`function parseEinvoice`**

- Auto-detects the XML format and delegates; null if not recognised.

### `src/lib/server/extract-batch.ts`

**`interface BatchEnqueueDeps`**

- Marks every open item queued and sends one pg-boss job each, idempotently. Deps injected (no module-level db/pg-boss) for infra-free tests. Guarded pending/failed → queued; false otherwise.

**`function enqueueBatchExtraction`**

- Idempotent: worker-owned (extracting) or settled (done/confirmed/discarded) items untouched; `queued` re-sent (pg-boss singletonKey dedups; never an error); `failed` re-queue — the retry path.
### `src/lib/server/extract.ts`

**`const EXTRACTION_PROMPT`**

- Classifies a file, prepares LLM input, returns structured invoice data. No DB access, no side effects. XML: structured parser directly, Gemini skipped. Image/PDF: Gemini vision or text extraction.

**`interface ExtractedInvoice`**

- Category the model proposes (#315) — raw output, never trusted; run through `resolveCategory` before `suppliers.category`. e-invoicing extensions (optional): `supplier_nif`, `qr_url` (AEAT/TicketBAI verification URL), `qr_mismatch` (QR vs AI conflict), `e_invoice_format` ('facturae_322' | 'ubl_21').

**`type GenerateFn`**

- Abstracted generate function — decoupled from the SDK so tests inject a mock.

**`function classifyPdf`**

- Pull the PDF text layer to decide text vs page images. Uses unpdf (maintained pdf.js build) over the unmaintained pdf-parse (#225); dynamic import so tests can mock and the bundle loads only for real PDFs. Malformed/encrypted/slow PDFs fall back to vision.

**`function callGemini`**

- Never embed the raw response — customer invoice content (names, amounts, tax IDs) would ship to logs/Sentry (#254).

**`function extractInvoice`**

- Structured XML path — skip Gemini, use the deterministic parser.

**`function callProvider`**

- Provider-based path (production — returns token usage). Never embed the raw response (#254).

**`function extractWithProvider`**

- Structured XML path — no LLM tokens consumed.

**`interface ExtractedInvoice`**

- The `supplier_*` fields all describe the *supplier*, never the buyer/restaurant; each optional because a document may simply not print it — leave null rather than fabricate.

### `src/lib/server/extraction-worker.ts`

**`function processExtractionJob`**

- Returns `'completed' | 'failed'` instead of `void` (#520): `'failed'` only for the one case the DEGRADATION_ERRORS classification (#482) marks retryable with retries left. Every other outcome — success, a corrupt job already dead-lettered, a permanent classification, the final attempt of a transient one — reports `'completed'`, matching what silently not-throwing meant before this return value existed. Never throws for its own classified outcomes; a genuinely unexpected exception (a bug, not a classified extraction failure) still propagates.

**`function runExtractionJobForBoss`**

- The `perJobResults: true` adapter `worker.ts` hands to `boss.work` for `extract-invoice`. Without `perJobResults`, `boss.work` settles an entire fetched batch by whether the handler's one returned promise threw, so on `batchSize > 1` (`MAX_CONCURRENT_EXTRACTIONS`, several invoices at once) throwing to redeliver one transient failure would redeliver every sibling job too, including ones that already completed — and `processExtractionJob` never threw for its own classification anyway, so the queue's configured `retryLimit: 2` (`queue.ts`) was unreachable: a rate-limited extraction just sat marked `extracting` until the separate stall clock caught it, minutes later. `perJobResults` gives each job its own disposition, so `runExtractionJobForBoss` reports `failed` only for the job that classified as retryable — pg-boss redelivers per its own retryCount/retryLimit — and `completed` for everything else. A genuinely unexpected exception still routes through `runWithDeadLetter`'s existing retriesLeft-based policy, same as every other queue in `worker.ts`.

### `src/lib/server/normalize.ts`

**`function normalizeProductKey`**

- Shared product/unit normalization (#296). TS-side definition of "same product" (lowercase, accent-folded, whitespace-collapsed) — MUST stay in lockstep with the SQL twin mep_norm_key (drizzle/0018_product_key_normalization.sql), used by materialized views and cross-invoice matching. `canonicalizeUnit` folds supplier spellings and e-invoice codes — "Kgs"/"KILO"/"KGM" → "kg"; unknown → null so callers flag requiresUnitConversion. Pure module — no DB imports, safe for worker and tests.

**`const UNIT_GROUPS`**

- canonical spelling → accepted variants (after normalizeProductKey + trailing-dot strip; lowercase/unaccented). UN/ECE Rec 20/21 codes (UBL unitCode) folded in directly: KGM, LTR, C62…

**`function canonicalizeUnit`**

- Canonical form or null (→ requiresUnitConversion). Sized-container formats ("media caja", "garrafa 5L") deliberately NOT mapped — they need a conversion factor, not a pass-through.

### `src/lib/server/qr.ts`

**`interface AeatVerifactuQrData`**

- VERI*FACTU / TicketBAI QR parsing and verification. AEAT URL format (Orden HAC/1177/2024): `ValidarQR?nif=X&numserie=Y&fecha=DD-MM-AAAA&importe=N.NN` (+ NoVerifactu path). TicketBAI by territory: Bizkaia batuz.eus/QRTBAI, Gipuzkoa tbai.gipuzkoa.eus/qr, Araba araba.eus/tbai/qr.

**`function parseQrUrl`**

- Decoded QR string → structured data; null if not a recognised Spanish e-invoice verification URL.

**`function qrFechaToIso`**

- DD-MM-AAAA → YYYY-MM-DD; null if not recognised.

**`function isoToQrFecha`**

- YYYY-MM-DD → DD-MM-AAAA.

**`function detectVerifactuMismatch`**

- Mismatches between VERI*FACTU QR fields and AI-extracted fields. VERI*FACTU only — TicketBAI encodes an opaque ID, not raw fields.

**`function buildAeatVerificationUrl`**

- AEAT verification URL from a parsed QR result — the "Verificar en AEAT" deep link on the invoice detail page.
