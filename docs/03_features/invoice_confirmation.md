# Feature Spec — Invoice Confirmation (review → save)

## Purpose

Turn an extracted (and reviewed) batch item into the canonical, authoritative
`invoices` row — with duplicate/idempotency protection and the low-confidence
gate. **This is THE invoice write path (ADR-008). Do not add another.**

## Actors

- Signed-in member of the active restaurant confirming on `batch/[id]`.

## Preconditions

- Batch item `done` (extraction succeeded) or `failed` (retryable).
- `locals.restaurantId` set.

## Inputs

- Corrected header fields + line items from the review form.
- `low_confidence_ack` flag when confidence < 0.85.
- Optional `qr_url` when the source had a VERI\*FACTU QR.

## Outputs

- `invoices` + `invoice_line_items` rows (`status='pending'` unless accepted).
- `batch_items` → `confirmed` (inside the same transaction).
- `suppliers`/`products`/`product_aliases` upserts as needed.
- `extraction_corrections` rows for user changes.
- Post-commit: alerts (`alerts.ts`), product suggestions, VERI\*FACTU mismatch
  alert, onboarding flag.
- Redirect: `/dashboard?first_invoice=1` or `/invoices?saved=`.

## Business rules

1. **Low-confidence gate** (`invoice-save.ts:200-210`): block unless ack when a
   header field conf < 0.85 or overall conf < 0.85 → `lowConfidenceBlocked`.
2. **Content-hash dedup** (`dedup.ts:9-36`): SHA-256 over canonicalized
   supplier/num/date/due/total + line desc/qty/unit/price; matched against
   `contentHash` WHERE `deletedAt IS NULL` → `contentDuplicate`.
3. **Transaction** (`invoice-save.ts:310-416`):
   - `claimRequest(idemKey)` → replay = no-op; `releaseRequest` on early abort.
   - `getOrCreateSupplierId` (proposed category only when name matches).
   - supplier+number duplicate check → `numberDuplicate`.
   - insert with `onConflictDoNothing` (unique-index backstop).
   - line inserts with unit conversion factors, pack parse, normalized price.
4. **Post-commit** (`invoice-save.ts:426-477`): `linkProductsToInvoice`,
   all alert engines, `runVerifactuCheck` (QR mismatch stored as `qrUrl`/
   `qrMismatch` + `verifactu_qr_mismatch` alert). Side-effect failures are
   non-fatal (the invoice is already committed).
5. **Onboarding**: first confirmed invoice sets `has_completed_onboarding`.

## State transitions

`batch_items: done → confirmed` (guarded, inside the save transaction).
Invoice: `(new, status='pending')`.

## Data dependencies

`invoices`, `invoice_line_items`, `batch_items`, `suppliers`, `products`,
`product_aliases`, `unit_conversions`, `extraction_corrections`,
`system_notifications`, `processed_requests`, `settings`, `stock_levels`,
`category_budgets`.

## API dependencies

`batch/[id]` `save` action (returns 422 on low-confidence/duplicate, discards on
number-duplicate). `api/batch-status/[id]` for status.

## UI dependencies

`batch/[id]/+page.svelte` (per-item review, low-confidence + duplicate modals,
`duplicateOfId` pre-warning). Legacy `confirm/[id]`/`extract/[id]` redirect here.

## Background dependencies

- `normalize-product` queue (LLM product matching on created products).
- Alert engines run inline post-commit (no queue).

## External dependencies

LLM for product normalization (async); nothing else blocks the save.

## Validation

Low-confidence gate, content-hash, supplier+number uniqueness, unit/price
shapes, `low_confidence_ack` value.

## Error states

- `lowConfidenceBlocked`, `contentDuplicate`, `numberDuplicate` (422/fail).
- Idempotency replay (silent no-op, `replay`).
- Alert-engine failures are non-fatal (logged/Sentry).

## Edge cases

- Two users confirm the same item concurrently → one wins the guarded
  transition, the other gets a no-op.
- Re-submitting the same content after an edit → hash differs → allowed.
- Amount tolerance in VERI\*FACTU check > €0.005.

## Security rules

- Tenant scope on every read/write in the transaction.
- Idempotency key validated (`isValidKey`), never trusted unvalidated.

## Idempotency rules

- contentHash + partial unique index + `onConflictDoNothing`.
- `processed_requests` claim-once → `replay`.
- pg-boss `singletonKey` prevents duplicate enqueues upstream.

## Observability

- `trackEvent` on billing/save lifecycle; Sentry on non-fatal side-effect
  failures; `extraction_corrections` quantifies user edits.

## Acceptance criteria

- Confirming a `done` item creates exactly one invoice + lines, `confirmed`
  item, and fires alerts.
- A retry of the same request returns `replay` with no new rows.
- Low-confidence without ack is blocked; with ack it saves.
- Tests: `tests/invoice-save-category.test.ts`,
  `tests/invoice-save-products.test.ts`, `tests/invoice-save-verifactu.test.ts`,
  `tests/dedup.test.ts`, `tests/idempotency.test.ts`, `tests/race-idempotency.test.ts`.
