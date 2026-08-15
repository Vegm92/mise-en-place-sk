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
`system_notifications`, `idempotency_keys`, `settings`, `stock_levels`,
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
- `idempotency_keys` (`form-submit` scope) claim-once → `replay`.
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

## Code notes

### `src/routes/(app)/batch/[id]/+page.server.ts`

**`function statSize`**

- Stat errors are ignored — size stays '—'.

**`function findDuplicateInvoiceId`**

- Read-only heads-up: same supplier (case-insensitive, matching the `uq_suppliers_rid_name` index) + same invoice number as an already-saved invoice. Coarser than the content-hash gate on save; exists so the user can discard before reviewing fields.

**`function settledRedirect`**

- All items reviewed → leave the page: confirmed invoices land on the dashboard, an all-discarded batch goes home.

**`property save`**

- The done→confirmed transition commits atomically with the invoice insert so a crash can't strand the item as reviewable (issue #248).
- A replayed submit already saved on the first pass → `replay` lands on the batch page, which routes onward if settled.
- Straight to `/invoices?saved=` with a toast (issue #235) — the interstitial page it replaced only said "saved ✓".

**`property add`**

- If extraction is already running, new items fold straight into the queue.

**`const load`**

- `getBatchItems()` keys off `batchId` alone, so ownership is checked here; a foreign batch id gets the same redirect as an empty one, keeping the two indistinguishable to callers.

### `src/routes/(app)/batch/[id]/+page.svelte`

**`const timer`**

- Queue polling is the single feedback mechanism: while anything is queued/extracting, poll the batch status endpoint and reload server data on any status change. No simulated progress; network errors keep polling.

**`type LineItem`**

- Review form state.

**`const lineItems`**

- Synced from server data (not initialized once) — the active review item changes in place as invoices are confirmed.

**`const lowConfAckItemId`**

- The active review item changes in place (same component across batch items — the next invoice is a redirect back to this route, not a remount). Seeded with the current item, not null, so a fresh mount doesn't read as "item changed" and clobber the modal the effect just opened. A stale ack would silently bypass the server's low-confidence gate.

**`const supplierNameInput`**

- Editable header fields in local state so a correction survives a failed save (the low-confidence gate) instead of being overwritten by the server snapshot (issue #305); same "changed in place" guard as `lowConfAckItemId`.

**`const idempotencyKey`**

- One per review item (issue #250), regenerated only when the active item changes so a retry after a validation error reuses it.

**`const focusedItemId`**

- Focus the first uncertain field when a new review item appears.

**`const addFiles`**

- Add-more-file state.

**`markup`**

- Step cue for Upload → Extract → Review (issue #232); extract stays current while anything is in flight.
- Two-column grid: queue + active panel. Doc viewer, cabecera fields, line items, totals footer, failed-item and in-flight panels.
- The discard button sits visually inside the save form's header but targets an out-of-tree `#discard-item-form` — nesting real forms is invalid HTML.
- Content-duplicate block + low-confidence review gate modals; `svelte-ignore a11y_no_static_element_interactions` on their click-catchers.

### `src/routes/(app)/confirm/[id]/+page.server.ts`

**`const load`**

- Legacy route superseded by /batch/[batchId]: old links carry an item id, resolved to the batch when possible, otherwise home.

### `src/lib/server/invoice-save.ts`

**`type SaveOutcome`**

- Shared by the extract review route and the batch page; pure outcome-returning (no redirects/HTTP) — callers translate the outcome into `fail()`/`redirect()`.

**`function linkProductsToInvoice`**

- Resolves each saved line to a catalog product and stamps `product_id` (issue #298); fuzzy auto-links raise a `product_suggestion` the review UI can confirm/reject. Fully self-contained and error-swallowing — enrichment, never a reason to fail a save. When nothing deterministic matched, asks the LLM asynchronously (issue #300).
- Category for a supplier we may be about to create comes from the stored extraction, never the form (issue #315): it's a machine guess about the supplier, dropped when the confirmed name no longer matches the classified one; `resolveSupplierCategory` buckets anything unrecognised.

**`function saveReviewedInvoice`**

- Validates + persists a reviewed invoice. Does NOT transition the batch item on duplicates — callers decide. `onSaved` runs inside the same transaction so the confirm is atomic with the insert (issue #248).
- Gate: block the save when any header field is low-confidence and unacknowledged.
- Content-hash dedup: canonical hash over all user-confirmed fields; reject when a non-deleted invoice in the tenant already has it.
- Idempotency claim inside the save transaction (issue #250): a replay finds the key and skips the save; the key is released so a corrected resubmit isn't skipped. `onConflictDoNothing` guards the concurrent-insert race.
- Atomic supplier get-or-create (issue #238): concurrent saves converge on one row; supplier+number duplicate check runs too.
- Pack structure → €/base for cross-size comparison (issue #299); link step runs post-commit and is explicitly non-critical (#248/#298/#299). Unit resolutions are pre-computed outside the transaction (`type LineInput`).
- Supplier contact fields (CIF/NIF, address, email, phone) are only trusted when the reviewed supplier name still matches extraction — retargeting to a different supplier must not overwrite its contacts.
- VERI\*FACTU QR tamper check (issue #392): the QR is decoded off the document and never re-derived from reviewed/submitted fields; runs unconditionally before the insert so every invoice with a decodable AEAT QR gets it.
