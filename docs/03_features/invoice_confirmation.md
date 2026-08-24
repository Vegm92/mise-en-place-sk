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
2a. **Similar-invoice pre-warning** (`dedup.ts` — `amountsAreSimilar`,
   `findSimilarInvoice`; issue #449): advisory only, not a save-time gate. When
   the exact supplier+number check finds nothing, `batch/[id]`'s `load` also
   looks for a non-deleted invoice from the same supplier within ±21 days and
   a total amount within tolerance (max of €0.50 or 1%). Exists because a
   restaurant's albarán (delivery note, no formal invoice number) and the
   factura for the same delivery arriving weeks later carry different numbers
   and different file bytes, so neither dedup gate above catches them — but
   both documents can legitimately coexist fiscally, so this never blocks
   save, only surfaces `similarInvoiceId` for the reviewer to check.
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
`duplicateOfId` exact pre-warning, `similarInvoiceId` fuzzy pre-warning).
Legacy `confirm/[id]`/`extract/[id]` redirect here.

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

**`function findSimilarInvoiceId`**

- Only runs when the exact match above found nothing. Same supplier, non-deleted, `invoiceDate` within `SIMILAR_INVOICE_DATE_WINDOW_DAYS` (21) of the extracted date, then filters candidates in JS by `findSimilarInvoice`/`amountsAreSimilar` (`dedup.ts`) rather than in SQL — the tolerance math (max of an absolute and a relative epsilon) isn't expressible as a simple column comparison. Skipped entirely when the extraction has no date or no total (e.g. a priceless albarán), since there's nothing to compare against.

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

### `src/lib/server/alerts.ts`

**`function runPossibleDuplicatePurchase`**

- Soft, non-blocking heuristic for issue #449. The dedup gates above only catch the same document uploaded twice (content hash) or a repeated supplier+invoice_number pair. Neither can tell that an albarán captured at delivery and the factura fiscal for that same delivery, arriving weeks later, are the same real-world purchase — they carry different numbers by construction, and fiscally both can legitimately exist.
- Looks for an already-saved invoice from the same supplier, of the opposite `document_type`, within `DUPLICATE_DATE_WINDOW_DAYS` (21) and `DUPLICATE_AMOUNT_TOLERANCE` (10%) of the new one, and raises a review nudge instead of blocking the save.
- Requires `document_type`, `invoice_date` and `total_amount` on both sides, so an albarán with no printed prices can't be matched this way — a known gap (see #461), not a bug.

### `src/lib/server/money.ts`

**`toCents` / `fromCents` / `toMoneyString`**

- The money columns (`total_amount`, `tax_base`, `unit_price`, `total_price`, `normalized_unit_price`, `monthly_budget`) are `numeric(12,2)`, not `real` (issue #477 — float4 loses precision above ~6-7 significant digits and compounds error under SUM). Drizzle returns `numeric` as a string, so these parse/format it via integer cents rather than `parseFloat`/`toFixed`, which would reintroduce the float drift the column type change was meant to remove.
- `toCents` rounds half-up past two decimal digits rather than truncating, so extraction/form input with more precision than the column supports still lands on the cent the value was closest to.

**`sumCents` / `sumMoney`**

- For JS-side aggregation across multiple already-fetched rows (e.g. a per-supplier monthly total built in a loop) — SUM inside SQL is still preferred where the rows aren't already in hand, since Postgres does that arithmetic in exact `numeric`, not float64.

**`moneyToNumber` / `moneyToNullableNumber`**

- One-shot boundary conversion of an already-exact amount (a DB value, or a Postgres-side SUM/AVG) into a JS number for display or a threshold comparison — safe because it's a single conversion, not repeated arithmetic on stored money. `moneyToNumber` coerces a missing amount to 0 (matching the pre-#477 `?? 0` call sites); `moneyToNullableNumber` keeps `null` distinguishable from a real zero where that distinction is shown in the UI.

### `src/lib/server/dates.ts`

**`toIsoDate` / `isBlankOrIsoDate`**

- The companion to `money.ts` for the other half of the same data-model problem (issue #516). `invoice_date`/`due_date` were `text` written straight from the form, and every consumer compared them as strings — correct only for zero-padded ISO, so `"2026-1-5"` sorted after `"2026-12-01"` and `"05/01/2026"` sorted before every ISO date and read as permanently overdue. The columns are now `date`.
- `toIsoDate` rejects anything that isn't `YYYY-MM-DD` and then round-trips it through `Date.UTC` to reject dates that match the shape but don't exist (`2026-02-30`, `2025-02-29`). A regex alone would let those reach Postgres and throw at insert time instead of at the boundary.
- The two are split because blank and malformed need different answers: an absent date is legitimately `null`, a malformed one is a user error. `isBlankOrIsoDate` gates the write (`saveReviewedInvoice` returns `{ type: 'invalidDate' }`, the edit action returns `fail(400, { errorKey })`), `toIsoDate` normalises after the gate has passed.
- Drizzle's `date()` defaults to `mode: 'string'`, so the TS type stayed `string | null` and the value stayed `YYYY-MM-DD` — the column type change touched no component.
- `toIsoDate` itself now lives in `src/lib/dates.ts` and is re-exported here (issue #579): the `/invoices` filter parser runs on the client too, and `$lib/server/*` cannot be imported from client code. Server callers are unchanged.
- On read paths that take a date from the URL (`date_from`/`date_to` on the invoices list and the xlsx export), `toIsoDate` is used to drop a malformed filter rather than reject it. Against a `text` column garbage silently matched nothing; against a `date` column it makes Postgres throw, so an unvalidated query string would 500 the page.

**`toMonthKey`**

- The `month` columns (`category_budgets`, `monthly_usage`, `mrr_snapshots`, `acquisition_costs`) stay `text` because they are genuinely `YYYY-MM` keys, not dates — but they now carry a `CHECK` constraint so the same class of malformed value can't land in them either.
