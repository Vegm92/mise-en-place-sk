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
2. **Content-hash dedup** (`dedup.ts`): SHA-256 over canonicalized
   supplier/num/date/due/total + line desc/qty/unit/price/rate **and the tax
   breakdown**; matched against `contentHash` WHERE `deletedAt IS NULL` →
   `contentDuplicate`. Tax is part of the identity because an albarán and the
   factura for the same delivery carry the same lines and differ mainly in the
   tax on top — without it the second was refused as a duplicate of the first.
   Bands are sorted before hashing so reordering them in the UI does not change
   the document's identity, and money is canonicalized so 121.7 and 121.70 hash
   alike. Rows written before this change need
   `pnpm db:backfill-content-hash`.
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
Its three-pane workspace shape lives in the `.rev-*` component classes in
`src/app.css`. Legacy `confirm/[id]`/`extract/[id]` redirect here.

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

**`property retry`**

- Branches on the item's state: a `failed` item re-queues directly, while a still-in-flight (stalled) one goes through `requeueStalled` first, because `markQueued` refuses `queued`/`extracting`. Without the branch the Retry button on the stall card would be inert — the worst possible outcome for a control offered precisely because nothing is happening (#540).

**`function reapedItems`**

- Reaps only when an item actually looks expired, so the common read stays a single SELECT and the hard timeout costs nothing on healthy batches. Re-reads after a reap so the same request already renders the failed state.

**`const load`**

- `getBatchItems()` keys off `batchId` alone, so ownership is checked here; a foreign batch id gets the same redirect as an empty one, keeping the two indistinguishable to callers.

**`property stalled`**

- Computed over the *open* items and reported as the single worst offender, since the panel shows one state at a time; the queue sidebar keeps per-item status. Null while everything is inside the warning window, so the template can branch on it directly.

### `src/routes/(app)/batch/[id]/+page.svelte`

**`const timer`**

- Queue polling is the single feedback mechanism: while anything is queued/extracting, poll the batch status endpoint and reload server data on any status change. No simulated progress; network errors keep polling.
- It also reloads when the endpoint's `stalled` flag disagrees with the rendered one: crossing the stall threshold changes no status, so a status-only diff would leave the spinner up forever — the exact bug the stall states exist to kill (#540).

**`markup`**

- Three in-flight renderings, checked in order of what the user can act on: the failure card (Retry/Discard), then the stall card (same actions, softer wording, because the extraction may yet succeed), then the plain spinner. The stall card sits above the spinner branch so the page can never show "Extrayendo…" for an item it already knows is late.

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

**`const queueOpen`**

- Workspace layout state: queue rail folded/expanded, document pane shown/hidden, and its dragged width. Seeded so the rail starts folded whenever a review is already on screen (the editor is what the reviewer needs, not the file list), then overridden in `onMount` by whatever the user last chose. Persisted under `mep-review-*` localStorage keys; every write goes through `persist()` so a blocked storage API is a no-op rather than a crash.

**`function onSplitDown`**

- Pointer-capture drag on the pane splitter, clamped to `PREVIEW_MIN_W`/`PREVIEW_MAX_W`; arrow keys resize it from the keyboard and double-click restores the default. `.rev-dragging` on the page root kills the width transition and blocks iframe pointer events so the drag doesn't get swallowed by the PDF viewer.

**`function jumpToUncertain`**

- Cycles focus through every field extraction was unsure about — flagged header inputs first, then flagged line rows — so a reviewer can clear the warning banner without hunting. Both the banner and the header count badge trigger it.

**`function onWindowKeydown`**

- Shortcuts are modifier-based (⌘/Ctrl+Enter save, ⌘/Ctrl+\ document, ⌘/Ctrl+B queue, F2 next uncertain field) precisely because this page keeps focus inside an input almost the whole time — bare letter keys would type instead of act.

**`const taxBands`**

- Editable tax bands, seeded from the extraction and posted back with the form. One row per rate *and* type, because a single albarán routinely mixes them: produce at 10%, cleaning supplies at 21%, and a Recargo de Equivalencia band riding on the same base as the IVA one.
- The row model is what the reviewer types (percent strings, money strings); `$lib/tax` converts to the stored shape. Editing a rate or a base recomputes that band's cuota via `syncBandAmount`; editing the cuota itself is left alone, because a reviewer copying an odd figure off the paper must win over the arithmetic.
- `rebuildBandsFromLines` regenerates the IVA bands by grouping lines on their `% imp.` column, and deliberately leaves REC bands untouched: the IVA→REC rate pairing (21→5,2, 10→1,4, 4→0,5) is statutory and changes by law, so deriving it here would be inventing tax policy in the UI.
- `unbandedRates` catches the other direction — a line carrying a rate that no band covers — which is what silently loses tax when only some lines were annotated.

**`const taxBase`**

- Sums bases *per tax type*, then takes the largest group. A Spanish produce invoice carries IVA and Recargo de Equivalencia on the **same** base, so a flat sum across bands double-counts it; with a single type (or several rates of one type) the grouped max equals the plain sum. `taxableBaseCents` in `$lib/tax` is the shared implementation, so the figure shown and the figure stored cannot drift apart.

**`const isMobile`**

- A `matchMedia('(max-width: 900px)')` flag, not a CSS class, because this screen is a FORM: the codebase's usual `md:hidden` / `hidden md:block` pair (see `MobileInvoiceDetail`) puts both trees in the DOM, which is harmless for a read-only view and wrong here — duplicated inputs would post every line twice. Only the line-item block branches on it; the rest of the mobile treatment is CSS plus mobile-only chrome that carries no form values.

**`const returnField`**

- Option A's return path. A phone shows the document full-screen, so the field being checked goes off-screen; the viewer's bottom bar names the field you left and takes you back to it focused. `lastFocusedField` is tracked from `focusin` rather than read at click time — by the time the button's handler runs, activating it has already blurred the input.

**`function addRow` / `function removeRow`**

- Both maintain `openLine`, the index of the expanded mobile card. Adding opens the new row (a collapsed blank card reads as "nothing happened"); removing clears it when it was the open one and decrements it when an earlier row goes, or the index silently points at a different product — deleting one line would pop a different one open.

**`function jumpToUncertain`**

- Line targets carry an index rather than a selector, so the mobile path can expand the card before focusing it: a collapsed card's inputs are `type="hidden"`, which cannot be focused or scrolled to. The selector excludes hidden inputs on both layouts.

**`const previewIsImage`**

- A photographed invoice is an image, and an `<img>` beats an iframe on a phone: pinch-zoom works and no PDF plugin chrome eats the viewport. PDFs get `#toolbar=0&navpanes=0&view=FitH` so the page fits the width instead of opening cropped at 100%. Both keep an open-in-a-new-tab escape, which is also the fallback that matters on iOS Safari, where in-iframe PDF rendering is unreliable.

**`const addFiles`**

- Add-more-file state.

**`markup`**

- Step cue for Upload → Extract → Review (issue #232); extract stays current while anything is in flight.
- Three panes on one flex row (`.rev-*` classes in `app.css`): a queue rail that folds to an icon strip, a document preview that is resizable, hideable and expandable to full screen, and the editor pane taking every remaining pixel — the editor is where the work happens, so the other two are sized to get out of its way.
- The editor pane is a sticky header + one scrolling body + a sticky totals footer, so an invoice with many fields or many lines scrolls in place while the identity and the save action stay visible. Header fields sit in an `auto-fit` grid, so a wider pane shows more fields per row instead of more whitespace; the line-item table's section head and column head both stick as it scrolls.
- The discard button sits visually inside the save form's header but targets an out-of-tree `#discard-item-form` — nesting real forms is invalid HTML.
- Content-duplicate block + low-confidence review gate modals; `svelte-ignore a11y_no_static_element_interactions` on their click-catchers.
- Under 900px the phone gets its own treatment (`.rev-strip`, `.rev-card*`, `.rev-actionbar`, `.rev-returnbar` in `app.css`), reached through `.rev-mobile-only` / `.rev-desktop-only`. The desktop tree is untouched: the rail, the document pane and the splitter are simply hidden.
- Chrome drops from roughly 790px before the first field (flow steps + queue card + squashed preview + a header bar wrapping to three rows) to ~164px: a one-row document strip that unfolds into the list by name, and a sticky action bar. The document moves to the existing full-screen lightbox, opened from that bar.
- Line items become cards: the product name leads at 14.5px/600 and may wrap, quantity × price sits under it, total and the rate chip go right, and the line number is gone — at 390px the old fixed-width table crushed the description column to zero, which is the one thing a reviewer needs to read. Tapping a card expands it to 44px controls; collapsed cards keep their values in hidden inputs so every line still posts in order.
- Both `display` toggles are order-sensitive: `.rev-mobile-only` and the component's own rule are single-class selectors, so whichever comes later in `app.css` wins. Mobile-only components therefore declare no `display` outside the media query, and `.rev-actionbar` re-declares `display: flex` inside it.
- The tax desglose is an editable drawer that opens between the scroll body and the totals bar, toggled from the footer's tax figure — the number and its explanation live together, and it stays reachable without scrolling past every line. In-flow rather than an absolutely-positioned popover because the pane's `overflow: hidden` would clip one. Each band is rate / kind / base / cuota, all editable, with add and remove.
- Line items carry a `% imp.` column, so different products on one document can carry different rates. It posts as `line_tax_rates` in fraction form through a hidden input beside the visible percent field, keeping `parseLineInputs`' positional alignment intact.
- The footer separates two comparisons that are easy to conflate: **Discrepancia** is the calculated total against the header total field (which the reviewer can edit), while **Extraído … ±Δ** is the calculated total against what the AI originally read off the document, which nothing can edit away. A reviewer correcting a genuine extraction error should see the second figure move and be sure the change was meant.
- That totals row wraps (issue #658). It is `nowrap` by design so a figure never splits from its label, but on a phone the row measured 667px inside a 390px frame: **Extraído** was pushed off the right edge and the whole review shell scrolled sideways to reach it. `flex-wrap: wrap` on `.rev-foot-totals` breaks it between figures instead of past the frame, and the mobile override no longer spreads the wrapped rows apart.
- Line-item inputs are bound to `lineItems` state. They were previously one-way `value={…}`, so `lineTotal`, `totalCalc` and the discrepancy indicator never moved when a reviewer corrected a price — the footer reported on the extraction, not on what was about to be saved.

### `src/routes/(app)/confirm/[id]/+page.server.ts`

**`const load`**

- Legacy route superseded by /batch/[batchId]: old links carry an item id, resolved to the batch when possible, otherwise home.

### `src/lib/server/rehash.ts`

**`function hashForStoredInvoice`**

- Recomputes a saved invoice's `contentHash` from its stored columns, for the one-off backfill (`pnpm db:backfill-content-hash`) that migrates rows written before tax entered the hash. Without it those rows keep a hash no new save can reproduce, so re-uploading an already-saved albarán would slip past the content gate — the supplier+number index does not cover documents with no number. A test pins it against `computeFormContentHash` so the two cannot drift.
- The backfill skips a row whose new hash is already taken rather than failing on `uq_invoices_rid_content_hash`: two rows that were distinct only because the old formula ignored tax can legitimately collide under the new one, and leaving the loser on its old hash is safer than touching either row's data.

### `src/lib/tax.ts`

**`function percentToFraction`**

- Tolerates a trailing `%`, since the field it backs is labelled `% imp.` and typing the sign is natural; the stored value stays the raw text and normalises on the way out. Rejects negatives, exponent notation and a bare `%`. A typed `0` is a real rate (exento) and must stay distinct from no rate at all — anything testing it for truthiness rather than `null` reads 0% as untaxed.

- The UI always speaks percent, storage always speaks fraction — the Gemini schema asks for `0.21` and both e-invoice parsers divide by 100, so every stored `rate` (and every `invoice_line_items.tax_rate`) is a fraction. Keeping one direction per layer is what stops a "21" from ever being read as 2100%.
- Deliberately unambiguous rather than clever: an input is *always* a percentage, so `0.21` typed into a `%` field means 0,21%, not 21%. Guessing by magnitude would silently mangle a genuine 0,5% REC band.
- `fractionToPercent` tolerates a stored value above 1 as already-percent, so a malformed extraction degrades to a wrong-looking figure the reviewer can correct rather than a 2100% one.

**`function taxableBaseCents`**

- Shared by the review page and `invoice-save.ts` so the base shown and the base stored are the same number. Lives outside `$lib/server` because the page needs it; `money.ts` moved to `$lib/money` for the same reason, with `$lib/server/money` left as a re-export so its existing importers are untouched.

### `src/lib/server/invoice-save.ts`

**`function computeFormContentHash`**

- Keeps the surviving line *indices*, not just the surviving descriptions: it used to index quantities/units/prices by position in the filtered list, so one blank description among real ones shifted every later column against its description and hashed an invoice that was never saved. `parseLineInputs` always skipped blanks correctly, so the hash and the stored rows disagreed.
- Takes the tax bands as an argument rather than re-reading the form, so the batch path and the edit path (which posts no bands and passes the invoice's stored ones) produce the same hash for the same document.
- `lineUnitPrices`/`lineTotalPrices` were already hashed via `toMoneyString` on the *raw form string*, never through `toFloat` — only `parseLineInputs`' stored `unitPrice`/`totalPrice` columns went `toFloat(raw)` → `toMoneyString(float)`, an extra hop `toFloat`'s bug could corrupt (issue #494 follow-up, issue #508). A comma-decimal price (`"12,50"`) therefore hashed correctly (`12.50`) but stored truncated (`12.00`) — hash and stored data silently disagreed. Now that `parseAmount` replaces `toFloat`, both hops agree, so this specific divergence is closed without changing what price fields hash to. `lineQuantities`/`lineTaxRates` *did* go through `toFloat` on both sides (hash and storage), so they were internally consistent pre-fix, just consistently wrong for comma-decimal input; switching them to `parseAmount` changes what a comma-decimal quantity/tax-rate hashes to. The only rows this can affect are ones that were originally submitted with a comma-decimal quantity or tax rate — their `content_hash` was already computed from truncated data, so a resubmit of the identical original text after this fix ships would (correctly) no longer match that stale hash; accepted as within scope for #508, not a reason to backfill `content_hash` for otherwise-correct invoices.

**`function resolveTaxBreakdown`**

- Also returns the parsed `bands`: the same values feed both the stored `tax_breakdown` and the content hash, and deriving them twice would let the two drift. It is called before the hash for that reason.
- The form wins when it posts `tax_bands_present`, the extraction is the fallback otherwise. The marker matters: without it, a reviewer deleting every band would be indistinguishable from a caller that never sent tax fields, and the extraction's bands would silently come back.

**`type SaveOutcome`**

- Shared by the extract review route and the batch page; pure outcome-returning (no redirects/HTTP) — callers translate the outcome into `fail()`/`redirect()`.
- `invalidAmount` (issue #508): a monetary form field (`total_amount`, `line_quantities`, `line_unit_prices`, `line_total_prices`, `line_tax_rates`) that isn't blank but fails `parseAmount` — a garbage prefix (`"12abc"`), scientific notation, a hex literal, or an unparseable separator combination. Both write paths (`saveReviewedInvoice` and the invoice edit action) call `findInvalidMonetaryField` before any parsing/insert, so malformed input is rejected with `error.invalidAmount` and nothing is written, instead of silently becoming `null` or a truncated number.

**`function findInvalidMonetaryField`**

- The old per-field `toFloat` (`parseFloat` + `isNaN`) accepted a leading numeric prefix and ignored the rest — `"12abc"` → 12, `"1e999"` → `Infinity`, and for the Spanish-first audience, a decimal comma (`"12,50"`) → 12, silently dropping the fraction. Replaced everywhere (here and the extraction-correction comparator, `normalizeNum`) with `parseAmount` from `$lib/money`, the same strict parser `toCents`/`toMoneyString` are built on — one shared definition, so a monetary field can't diverge between what's validated, hashed and stored.
- Only flags a *non-blank, unparseable* value — blank stays optional (`null`), matching the pre-#508 behaviour for fields nobody is required to fill in. Line fields are checked only for rows `parseLineInputs` would actually keep (a non-blank description); a blank row's leftover garbage in a monetary column is never submitted and must not block the save.

**`function linkProductsToInvoice`**

- Resolves each saved line to a catalog product and stamps `product_id` (issue #298); fuzzy auto-links raise a `product_suggestion` the review UI can confirm/reject. Fully self-contained and error-swallowing — enrichment, never a reason to fail a save. When nothing deterministic matched, asks the LLM asynchronously (issue #300).
- Category for a supplier we may be about to create comes from the stored extraction, never the form (issue #315): it's a machine guess about the supplier, dropped when the confirmed name no longer matches the classified one; `resolveCategory` buckets anything unrecognised.

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

- Soft, non-blocking heuristic for issue #449, extended in #809 to a real factura↔albarán link. The dedup gates above only catch the same document uploaded twice (content hash) or a repeated supplier+invoice_number pair. Neither can tell that an albarán captured at delivery and the factura fiscal for that same delivery, arriving weeks later, are the same real-world purchase — they carry different numbers by construction, and fiscally both can legitimately exist.
- Looks for an already-saved invoice from the same supplier, of the opposite `document_type`, within `DUPLICATE_DATE_WINDOW_DAYS` (21) and `DUPLICATE_AMOUNT_TOLERANCE` (10%) of the new one.
- Beyond supplier+date+amount, compares line-item descriptions between the two documents (accent/case-insensitive via `normalizeProductKey`). When the overlap ratio reaches `CONFIDENT_LINE_OVERLAP_RATIO` (0.5, relative to the smaller line count), the two are treated as the *same delivery*: returns a `related_document_found` alert (not a duplicate-risk warning) plus `linkedInvoiceId`, which `saveReviewedInvoice` persists on `invoices.linked_invoice_id` on both rows — a real, queryable link, not just a one-off notification payload. Below that threshold it falls back to the original `possible_duplicate_purchase` nudge and no link is persisted; only that weaker case still flips `reviewState` to `incidencia`.
- Requires `document_type`, `invoice_date` and `total_amount` on both sides, so an albarán with no printed prices can't be matched this way — a known gap (see #461), not a bug.
- `documentType` itself can now be corrected by the reviewer in the batch review form (`document_type` form field) rather than only trusting Gemini's classification; `saveReviewedInvoice` prefers that override when present.

### `src/lib/server/money.ts`

**`parseAmount` / `normalizeAmountString` (issue #508)**

- Strict shared parser behind every monetary form field, both write paths (`invoice-save.ts`, the invoice edit action) and `toCents`/`toMoneyString`. Rejects anything `Number()`/`parseFloat` would otherwise mangle silently: a numeric-prefix-plus-garbage string, scientific notation (`Infinity`), a hex literal, and a non-finite result — returns `null` instead, so callers can tell "no value" from "not a number" is a decision left to the caller (`findInvalidMonetaryField` in `invoice-save.ts` treats non-blank + `null` as a validation error).
- Comma decimals are accepted deliberately (the Spanish-first audience types `12,50`), and so is a single period — both are treated as the decimal separator, never a thousands grouping, because a lone separator is inherently ambiguous (`"1.500"` could be 1.5 or 1500) and guessing wrong would silently corrupt an amount. Only *unambiguous* thousands-grouped input is accepted: `"1.234,56"` (ES: period groups of exactly 3 digits, comma decimal) and `"1,234.56"` (US, reversed roles) both parse to `1234.56`; anything with a group that isn't exactly 3 digits, or two separators of the same kind, is rejected rather than guessed at.
- `toCents` used to carry its own copy of this regex; now both share `normalizeAmountString` so the money-string columns (2-decimal, cent-rounded) and the full-precision fields (`quantity`, `tax_rate`, `confidence`) can never disagree about what counts as a valid amount.

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
