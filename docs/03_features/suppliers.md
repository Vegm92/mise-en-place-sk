---
tags: [mep, features]
related: "[[CONTEXT]]"
---

# Feature Spec — Suppliers

## Purpose

Maintain the vendor directory auto-created from invoices, with categories,
contact data, and reliability scoring — the anchor for spend analytics and
price-shock history.

## Actors

- Signed-in member (view/edit).
- AI extraction (auto-create + category proposal).
- `supplier_category` API (user sets category).

## Preconditions

- Tenant exists; extraction or user action supplies a supplier name.

## Inputs

- Supplier name (+ optional contact, category) from extraction or user.
- Category selection via `(app)/api/supplier-category`.
- Supplier-list view state from `/suppliers` search params: `sort`, `q`,
  `category`, `uncategorized` (issue #580).

## Outputs

- `suppliers` row (unique per `(rid, lower(name))`, plus `normalized_cif` as the
  identity key when the document prints one).
- `supplier_aliases` row per extra trade name a tax id turns out to carry.
- `supplier_metrics` reliability scores (computed + cached).
- Supplier list rows carrying `total_spend` alongside `month_spend`.
- Category nudges/suggestions notifications.

## Business rules

- **Resolution order** (`supplier.ts`, issue #905 task 3): normalised tax id →
  captured alias → `ON CONFLICT (restaurant_id, lower(name))` insert. Only the
  last step can create a row.
- **Upsert** (`supplier.ts`): `ON CONFLICT (restaurant_id, lower(name))`
  fills missing contact via `COALESCE(suppliers.x, <merge value>)`; category
  validated against the restaurant's own `categories` (`resolveCategoryFor`,
  ADR-037 part 2, issue #881) else `'Other'`.
- **Tax-id identity**: `suppliers.normalized_cif` holds `normalizeTaxId(cif)` and
  is **unique** per tenant (`suppliers_rid_normalized_cif_idx`, issue #949). A
  supplier already holding the document's tax id wins over any name, so a razón
  social and a nombre comercial that share a NIF stay one row — and the database
  now refuses a second row rather than relying on the resolution order to avoid
  one.
- **Tax-id trust gate** (`taxIdDecidesIdentity`, issue #905 task 3): a tax id
  only resolves identity when it passes the Spanish checksum and its
  `field_confidences.supplier_nif` is at least 0.85. A misread digit or a foreign
  VAT number falls through to name/alias matching instead of merging two
  unrelated businesses into one row, which nothing in the app can undo today.
- **What the gate now also decides is storage** (issue #949): the printed value
  is always kept in `suppliers.cif`, but `normalized_cif` is written only when
  the gate passes. The column stopped being "whatever the document printed" and
  became a matching key the database holds unique, so an id that can never match
  cannot occupy it — and an id read too faintly to merge on can no longer collide
  with the row that legitimately holds it.
- **Alias capture**: when the tax id resolves a supplier whose stored name is a
  different entity name (`isSameSupplierName` says no), the printed name is
  written to `supplier_aliases` so a later document that prints only that name —
  and no tax id — still lands on the same supplier. An alias never beats a real
  supplier name: the lookup skips itself when a supplier of that name exists.
- **Category resolution** (`categories.ts`'s `resolveCategoryFor`, the
  per-restaurant successor to `constants.ts`'s `resolveCategory`): matches the
  proposal against the restaurant's own visible categories first
  (diacritic-stripped name match), then the global default taxonomy; `'Other'`
  either way when confidence is below `MIN_CATEGORY_CONFIDENCE` (0.6) or the
  match isn't currently visible to this restaurant (ADR-037).
- **Contact fields**: `cif`, `contactEmail`, `contactPhone`, `address` persisted
  from extraction and edits.
- **Name normalization** (`normalize.ts`): Spanish legal forms (SLU, SCP, SA…)
  stripped for same-supplier detection.
- **Product aggregates** (issue #575): the detail "Productos" tab groups a
  supplier's `invoice_line_items` by `(description, unit)` across its
  non-deleted invoices and reports average unit price, **total spend**
  (`SUM(total_price)`) and **units purchased** (`SUM(quantity)`), plus the last
  purchase date. Total spend is `null` (rendered as `—`) when no line in the
  group prints a total price; units are always summed.
- **List sort/filter** (`supplier-list.ts`, `supplier-list-query.ts`, issue #580):
  the `/suppliers` list is sorted and filtered in SQL, driven entirely by URL
  search params so a view survives reload and can be shared.
  - `sort` ∈ `spend_desc` (default), `spend_asc`, `name_asc`, `name_desc`,
    `last_invoice_desc`, `last_invoice_asc`, `reliability_desc`,
    `reliability_asc`. Anything else falls back to the default — an unvalidated
    key never reaches SQL.
  - `q` matches supplier name OR resolved category, case-insensitively; `%`,
    `_` and `\` are escaped so a wildcard typed by the user stays literal.
  - `category` must be one of the restaurant's own `categories` (plus
    `'Other'`, ADR-037 part 2, issue #881); anything else is ignored (no
    filter) rather than returning an empty list.
  - `uncategorized=1` keeps only suppliers with at least one line-item product
    whose category is NULL or `'Other'`.
  - Every predicate composes onto `forTenant().scope(suppliers.restaurantId, …)`,
    including the `EXISTS` sub-select behind the uncategorized toggle.
- **Reliability** (`supplier-reliability.ts`): score = price stability (CV of
  unit price, 180 d, top 5 items; <5% → 33, ≤15% → 20, else 0) + frequency
  (gap analysis → 33/15/0) + timeliness (% paid vs total with due dates;
  ≥90% → 34, ≥70% → 20, else 0). Defaults 20/15/17.

## State transitions

n/a (row upsert + metric recompute).

## Data dependencies

`suppliers`, `supplier_metrics`, `unit_conversions`, `invoices` (spend/history),
`mv_supplier_monthly_spend`.

## API dependencies

`suppliers` routes, `(app)/api/supplier-category`, `(app)/api/product-aliases`
(dismiss suggestions).

## UI dependencies

`MobileSuppliersList.svelte` (mobile list), `suppliers/+page.svelte` (desktop
list, built on `ListPageTemplate.svelte`), `DesktopSupplierDetail.svelte`,
`suppliers/[id]/+page.svelte`. There is no `DesktopSuppliersList.svelte` — the
desktop list lives inline in the route; both variants render and CSS picks one
(ADR-020), so a list control has to be added to both.

## Background dependencies

None (metrics computed on read/demand, cached).

## External dependencies

None.

## Validation

Category ∈ the restaurant's own `categories` plus `'Other'` (ADR-037 part 2,
issue #881); name non-empty; tenant scope. List search params validated by
`parseSupplierListParams` before any of them reaches a query.

## Error states

- Category save for a supplier outside tenant → 404/403.
- Reliability computation with no invoices → defaults (20/15/17).

## Edge cases

- Same legal supplier under two spellings → one supplier when the documents
  print the same tax id, or when the second spelling was already captured as an
  alias. With no tax id on either document and no alias yet, they are still two
  suppliers.
- Duplicate rows created before issue #905 keep their own `normalized_cif` after
  the backfill; the first (lowest `id`) wins every later match. Merging them is
  destructive (invoices, metrics and product aliases point at `supplier_id`) and
  is deliberately left to its own migration, which is also what a partial *unique*
  index on `(restaurant_id, normalized_cif)` has to wait for.
- Extraction of contact fields for an existing supplier → COALESCE keeps the
  user's saved values.

## Security rules

- All supplier reads/writes scoped to `locals.restaurantId`.

## Idempotency rules

- Upsert is idempotent by the lower(name) unique constraint.
- The #949 merge migration is re-runnable: it recomputes its duplicate groups
  from the current rows, so a second run finds none and writes nothing.
- The tax-id branch takes `pg_advisory_xact_lock(restaurant_id, normalized_cif)`
  first, so two concurrent saves for one tax id under two different names
  serialise instead of racing to insert two rows. The lock only spans an
  enclosing transaction — both production call sites pass one.

## Observability

- Category nudges/suggestions are observable as notifications.

## Acceptance criteria

- A first invoice creates the supplier with the extracted category (if conf
  ≥ 0.6) and contact data.
- Editing category persists; suggestions mark their nudge `sent`.
- Reliability scores compute from price/frequency/timeliness inputs.
- The "Productos" tab shows a "Gasto total" column and a "Unidades compradas"
  column, aggregated per product, in both the mobile and desktop variants, and
  labelled in ES and EN (issue #575).
- Tests: `tests/supplier-category.test.ts`, `tests/supplier-contact-save.test.ts`,
  `tests/supplier-reliability-price-stability.test.ts`, `tests/db-crud.test.ts`,
  `tests/supplier-products-aggregates.test.ts`, `tests/supplier-list-query.test.ts`.
- The supplier list offers 4+ sort options, a debounced text search, a category
  dropdown and an uncategorized-products toggle; all four live in the URL and
  are applied server-side (issue #580).

## Code notes

### `src/routes/(app)/api/product-aliases/+server.ts`

**`const POST`**
- Confirm/reject/dismiss a pending product-alias suggestion (issue #298). A pending suggestion (fuzzy `product_aliases` auto-link, or async LLM proposal, issue #300) raises a `product_suggestion` notification.
- confirm (+targetProductId): merge the description into an existing product the LLM proposed; confirm (no target): keep the fuzzy link, mark confirmed; reject: split the description into its own product; dismiss: clear the suggestion (LLM proposals need no DB change).
- The notification carries the raw `description`; the raw_key is derived server-side so the client never knows the alias id.

**`function dismissSuggestion`**
- Marks the matching `product_suggestion` notification(s) as handled.

### `src/routes/(app)/api/supplier-category/+server.ts`

**`const POST`**
- Accept or decline a suggested supplier category (issue #315), posted from the bell. Accept writes the category; dismiss clears the suggestion without touching the supplier. The suggestion comes from extraction when it has one, otherwise from the category carrying ≥50% of that supplier's line spend (`dominantSupplierLineCategory`, ADR-027) — the payload's `source` says which.
- Category re-validated against `visibleCategoryNames(rid)` (ADR-037 part 2, issue #881) — the restaurant's own non-hidden `categories`, not the fixed `VALID_CATEGORIES` — and `'Other'` is explicitly excluded: accepting a suggestion always moves a supplier *out* of the uncategorised bucket into one of the restaurant's real categories, so a stale notification can't overwrite a newer manual choice.

**`const updated`**
- Bucket or legacy NULL only — never overwrite a real category (`or(isNull(...), eq(..., UNCATEGORIZED_CATEGORY))`).

**`const POST`**
- Not this tenant's supplier, or already categorised by hand: clear the stale suggestion either way so the bell doesn't keep it.

**`function dismissSuggestion`**
- Marks the supplier's pending category suggestion as handled.

### `src/routes/(app)/suppliers/[id]/+page.server.ts`

**`const load`**
- Builds 7-month spend history for the chart.
- The `products` aggregate groups line items by `(description, unit)` over this supplier's non-deleted invoices; `totalSpend` sums `total_price` and `totalQty` sums `quantity` (issue #575). `SUM(numeric)` comes back as a string, so `totalSpend` goes through `moneyToNullableNumber` (null stays null — "no priced line" is not "€0"), and `totalQty` through `Number(...)`; neither is trusted as a JS number straight from the driver.

- `categories` handed to the page (both the mobile edit form here and `DesktopSupplierDetail.svelte`'s) is `selectableCategoryNames(rid)` — the restaurant's own `categories` plus `'Other'` — not the fixed `VALID_CATEGORIES` (ADR-037 part 2, issue #881); the two UI variants render the same options (ADR-020).

**`property update`**
- Backfill (issue #307): products from this supplier's invoices only ever get a category at creation time (usually the 'Other' default). Editing the supplier here is the one moment a user expresses a real category, so carry it onto still-uncategorized products instead of leaving them on 'Other' forever.
- The submitted category is validated against `selectableCategoryNames(rid)`, same list the dropdown offered — anything else is dropped to `null` rather than written.

**`property delete`**
- One transaction — a crash between statements must not leave invoices detached from a supplier that still exists (issue #247).

### `src/routes/(app)/suppliers/[id]/+page.svelte`

**`const SERIES_COLORS`**
- Product spend donut — top 5 + "Other", fixed categorical hue order (never cycled).

**`const productDonut`**
- Slice spend now prefers the exact `totalSpend` aggregate and only falls back to `avgPrice × totalQty` when no line in the group printed a total price (issue #575) — otherwise the donut and the "Gasto total" column below it would disagree.

**`markup`**
- Mobile (edit form, KPI strip, tabs, info card, recent invoices, reliability, add form) and desktop supplier detail variants; `editing` toggles the edit form.
- Each mobile product card carries a two-up "Gasto total" / "Unidades compradas" block — the mobile counterpart of the desktop table columns (ADR-020: both variants ship, CSS picks one).

### `src/routes/(app)/suppliers/+page.server.ts`

**`const load`**
- Refreshes stale reliability scores (>24h old) for suppliers with enough invoices.
- `parseSupplierListParams(url.searchParams, categoryNames)` is the only door the list's view state comes through (issue #580); the parsed value — never the raw param — feeds `supplierListFilter` and `supplierListOrderBy`, so an unknown `sort` degrades to the default instead of reaching SQL. `categoryNames` (`selectableCategoryNames(rid)`, ADR-037 part 2, issue #881) is the restaurant's own list, not the fixed `VALID_CATEGORIES` — a `category` param naming a category this restaurant doesn't have degrades to "no filter" exactly like an unknown one always did.
- The filter predicate is composed *inside* `tdb.scope(suppliers.restaurantId, …)` rather than beside it, so no future filter can be added without the tenant predicate travelling with it.
- `supplier_metrics` is LEFT JOINed purely so reliability can be ordered in SQL. `supplier_metrics.supplier_id` is UNIQUE, so the join adds no rows and the invoice aggregates are unaffected. The ordering reads the *cached* score: right after a recompute the order can lag by one page load, which is why the score itself is still merged from `metricsRows` for display.
- The parsed params are echoed back in the payload so both UI variants can rebuild the URL without re-parsing it.
- `categories` is the restaurant's own `selectableCategoryNames(rid)` ordered by how many of *this tenant's* suppliers sit in each, with `categoryCounts` alongside it (issue #658). The count query is scoped like every other, and it is deliberately separate from the list query: reading the counts off the filtered rows would shrink the filter UI the moment a filter was applied.

**`property create`**
- The submitted category is validated against `selectableCategoryNames(rid)` — the same list the "Add supplier" dropdown offered — anything else is dropped to `null` rather than written.

### `src/lib/supplier-list.ts`

**`const SUPPLIER_SORT_KEYS`**
- The closed set of sort options, shared by the loader and both UI variants. It lives outside `src/lib/server/` because the Svelte components need it to render the dropdown; it deliberately holds no Drizzle/schema import so it stays client-safe.

**`function parseSupplierListParams`**
- Validates every list search param: unknown `sort` → `DEFAULT_SUPPLIER_SORT`, unknown `category` → no category filter (an empty list would read as "this tenant has no such suppliers", which is a different and wrong answer), `q` trimmed, `uncategorized` strictly `'1'`.
- `category` validity is a caller-supplied `validCategories` list (ADR-037 part 2, issue #881), not a module constant — the module holds no `$lib/server` import (Drizzle/schema) on purpose, so the restaurant's own category names have to come from the caller, which is the server load reading `selectableCategoryNames(rid)`.

**`const SUPPLIER_SEARCH_DEBOUNCE_MS`**
- One debounce interval for both variants — the search box navigates rather than filtering locally, so each keystroke would otherwise be a round trip.

### `src/lib/server/supplier-list-query.ts`

**`function supplierListOrderBy`**
- Every ORDER BY is a Drizzle `sql` expression over real columns; the sort key only ever selects *which* prebuilt expression is used, so no user-supplied text is ever interpolated into SQL. Each option tie-breaks on `LOWER(name)` so equal spends/dates come back in a stable order.

**`function supplierReliabilityExpr`**
- `CASE WHEN COUNT(invoices.id) >= 3` mirrors the display rule: a supplier with a cached score but fewer than three invoices shows `—`, so it must not sort among the scored ones either.

**`function likeTerm`**
- Escapes `\`, `%` and `_` before wrapping the term in `%…%`. The term is a bound parameter, so this is not an injection guard — it stops a user typing `%` from silently matching every supplier.

**`function hasUncategorizedProducts`**
- Products have no `supplier_id`; the link is invoice → line item → product, so the toggle is an `EXISTS` sub-select correlated on `invoices.supplier_id = suppliers.id`. Every table inside it is scoped with `forTenant().scope()` — a correlated sub-select is exactly where a missing tenant predicate would go unnoticed.

### `src/routes/(app)/suppliers/+page.svelte`

**`markup`**
- Mobile / desktop supplier lists (CSS-selected variants). The desktop filter bar carries the category dropdown, the sort dropdown and the uncategorized-products toggle; the table renders `data.suppliers` straight from the server, with no second filtering pass in the browser.

**`function listUrl`**
- Patches the current search params instead of rebuilding them, so changing a filter preserves `period` (and anything a later feature adds).

**`const search` / `$effect`**
- The search box keeps local state and navigates on a debounce; `untrack` seeds it once, because re-seeding from `data` mid-flight would yank characters out from under someone still typing. Search navigations use `replaceState` so typing does not fill the history stack, while the dropdowns push a normal entry.

## Public routes (marketing, auth, webhooks)

### `src/lib/server/supplier-reliability.ts`

**`function computePriceStability`**
- Coefficient of variation per product, then averaged — not pooled across products (issue #308). Pooling raw prices from different items (€1/kg tomato vs €6 jar of olives) reads as huge "instability" purely from price levels, even when each is rock-steady.

### `src/lib/server/supplier.ts`

**`function getOrCreateSupplierId`**
- Atomic supplier get-or-create (issue #238), replacing the select-then-insert pattern in invoice-save, the edit action and the WhatsApp bot. Backed by `uq_suppliers_rid_name` on `(restaurant_id, lower(name))`; the no-op DO UPDATE makes RETURNING yield the existing row on conflict (bare DO NOTHING returns nothing).
- Case-insensitive, whitespace-trimmed name match; pass a transaction as `exec` to run inside an enclosing save.
- Category only ever applied at creation; new suppliers default to the 'Other' bucket (issue #307). Products no longer inherit it — since ADR-027 a product is born uncategorised and the `categorize-product` job gives it its own verdict — so the bucket is now only the fallback arm of `COALESCE(products.category, suppliers.category, 'Other')`. The proposed category (issue #315) is re-validated here through `resolveCategoryFor(restaurantId, category, undefined, exec)` (ADR-037 part 2, issue #881) — the restaurant's own visible `categories` rows plus the global-taxonomy fallback, degrading to `'Other'` for anything that isn't currently one of the restaurant's own categories — rather than the fixed `VALID_CATEGORIES` list. A conflict never overwrites an existing supplier's category — later invoices can't reclassify behind the user's back.

**`interface SupplierContactInfo`**
- Supplier-level contact fields lifted from an extracted invoice (CIF/NIF, address, email, phone); any may be null/undefined when the source document doesn't print them — never fabricated.

**`function findByTaxId`**
- The first resolution step (issue #905 task 3), and the only one that can point at a supplier whose name has nothing in common with the document's. Takes the advisory lock before reading, so the read-then-insert window it opens cannot produce two rows for one tax id. The `ORDER BY id` tie-break it used to carry is gone with #949: the partial unique index means the query can match at most one row, so there is nothing left to break a tie between.

**`function findByAlias`**
- Second step. The `NOT EXISTS` clause is the whole safety property: an alias is a hint recorded from one document, a supplier name is a row someone owns, so a name that exists as both resolves to the supplier and never to the alias' target.

**`function recordAlias`**
- Writes the trade name only when the tax-id match landed on a supplier with a genuinely different name — `isSameSupplierName` already ignores case, accents and legal forms, so "Distribuciones Sur" and "distribuciones sur, S.L." never generate an alias. `DO NOTHING` on conflict: the first supplier to claim a normalised name keeps it.

**`function getOrCreateSupplierId`**
- Contact fields filled with `COALESCE`, never overwritten — an existing non-null value (user-typed or earlier capture) always beats a new extraction.
- `contactTrusted` (issue #905) says whether the reviewed supplier name still matches the one the document printed. Untrusted contact data is applied on INSERT but withheld from the DO UPDATE arm: a row created by this save is the document's issuer whatever name the reviewer gave it, while an existing row may be an unrelated supplier the reviewer retargeted to, and must not inherit another document's CIF. Without the split, correcting a printed trade name to the legal name discarded the NIF for exactly the entities whose names vary between documents.
- `contact.cifConfidence` is the model's legibility score for `supplier_nif`, passed through from `resolveSupplierInfo`; absent (e-invoice XML, the edit screen, a caller with no extraction behind it) means no evidence against the reading, so it is treated as legible.
- Untrusted contact data also disables tax-id *matching* (issue #905 task 3), not just the merge. The reviewer having renamed the supplier away from what the document printed is exactly the case where the printed NIF may belong to a different entity than the name being saved.
- `identityCif` (issue #949) is the one value both the lookup and every write of `normalized_cif` read, so the column can only ever hold an id that would have resolved identity. Writing an id the gate rejected used to be free; under the unique index it is a save that throws, because the row that legitimately holds that id is already there — which is the case the gate exists to describe.

### `src/lib/server/supplier-merge-report.ts`

**`function reportSupplierMerges`**
- Dry run for `drizzle/0074_supplier_cif_merge.sql` (issue #949): the duplicate groups, the row each collapses into, and how many invoices move. Read-only, and deliberately runs *before* the migration — so the checksum bar is applied here in TypeScript rather than through the migration's own `mep_valid_spanish_tax_id`, which does not exist yet on the database being inspected.
- `invoicesBlocked` is the merge's one lossy edge, surfaced before anyone commits to it: `uq_invoices_rid_supplier_number` means two rows in a group printing the same invoice number cannot both sit under the winner, so one invoice stays where it is and its supplier row survives the merge. Counted as `shared - 1` per repeated number, which is exactly how many the migration will leave behind.
- Run it with `pnpm db:supplier-merge-report`.

### `drizzle/0074_supplier_cif_merge.sql`

**merge order**
- `supplier_id` is referenced from six tables with three delete behaviours, so the order is the correctness argument: `product_aliases` and `unit_conversions` are `ON DELETE set null` and silently lose their supplier scoping if the loser row goes first, and `invoices`/`extraction_corrections` are `no action` and would abort the migration. Every child is repointed first; `suppliers` rows are deleted last, and only the ones that kept nothing.
- `supplier_metrics` is the one child that cannot be repointed — it is `UNIQUE (supplier_id)` and derived. Both sides of a merge are dropped instead; the suppliers list recomputes any supplier whose cached score is missing, over the invoices the migration just moved.
- The loser's own name is inserted as an alias of the winner before anything is deleted. Without it the next document printed with that name would create the duplicate all over again: `getOrCreateSupplierId` only records an alias when a tax-id match lands on a *different* name, so a supplier's own name never has one.
- A loser that could not give up all its invoices survives, and step 7 takes `normalized_cif` off it anyway. It keeps its printed `cif` for a human to read; the winner owns the matching key, which is what the unique index needs.

**`function mep_valid_spanish_tax_id` / `function mep_supplier_norm_name`**
- SQL halves of `isValidSpanishTaxId` and `normalizeSupplierName`, in lockstep with the TypeScript by a parity test (`tests/supplier-cif-merge.test.ts`), the same arrangement as `mep_norm_key` in migration 0018. The merge needs both inside one transaction that also creates the unique index — a backfill script the operator might forget to run before deploying would leave the index un-creatable.

### `src/lib/tax-id.ts`

**`function normalizeTaxId`**
- Canonical form for any tax id before it is stored or compared (issue #905): uppercase, drop every separator, and strip a leading `ES` only when what remains is still a full 9-character id — otherwise a razón social beginning with "Es…" would lose its first two letters.
- Normalisation is deliberately independent of validation. Extracted supplier ids must be comparable even when they are foreign VAT numbers that no Spanish checksum accepts.

**`function taxIdDecidesIdentity`**

- The single gate every identity decision goes through (issue #905 task 3): supplier resolution and the receiver check both ask it, so the two cannot drift apart. Validity is required because a tax id read off a scan is the one field where a single wrong character silently points at a different legal entity — and the checksum catches almost every OCR digit slip, which no confidence score can. Confidence is required on top because a checksum can be passed by a legible-looking guess.
- The cost is deliberate: a foreign VAT number no Spanish checksum accepts never merges two names, it only falls back to name/alias matching. Missing a merge leaves two supplier rows a human can still reconcile; a wrong merge silently attributes one business's invoices to another and has no undo until the merge tooling exists.

**`function isValidSpanishTaxId`**
- Real checksums (DNI/NIE mod 23, CIF control character), not a shape regex, and it enforces the control *kind* each CIF entity letter allows — a digit for A/B/E/H, a letter for K/P/Q/R/S/N/W. A shape check would accept most single-character typos, which is precisely the input this exists to reject.
- Used to gate the restaurant's own CIF/NIF in Settings, where a human types it. It is not the right gate for extracted supplier ids: rejecting a valid foreign VAT number would drop identity data the document really carries.

### `src/lib/components/desktop/DesktopSupplierDetail.svelte`

**`const SERIES_COLORS`**
- Product spend donut — top 5 + "Other", fixed categorical hue order (never cycled).

**`const CL`**
- SVG chart constants.

**`markup`**
- Sticky header (breadcrumb, supplier header, delete confirmation, edit form); tabs resumen / facturas / productos / conversiones. Resumen: monthly spend chart, KPI strip, reliability breakdown, info card, recent invoices. Productos: donut + legend with hover detail, then the product table. Conversiones: add-conversion form.
- Product table columns: description, unit, average price, "Gasto total" (`sup.products.colSpend`), "Unidades compradas" (`sup.products.colUnits`), last purchase (issue #575). `colUnits` replaced the old `sup.products.totalQty` / "Cant. total" header — same number, the name the issue asked for — so that key was dropped rather than left as a dead duplicate.

### `src/lib/components/mobile/MobileSuppliersList.svelte`

**`markup`**
- Search, sort dropdown, category chips (plus an uncategorized-products chip), summary strip, list. Same URL-driven params as the desktop variant (ADR-020); the component owns no filtering, it only reports the patch through `onApply` and lets the loader answer.
- The category chips are a `ScrollStrip` holding at most `INLINE_CATEGORY_CHIPS` (4) of the categories the tenant actually buys from, plus a "+n categorías" chip that opens the filter sheet with the full list and per-category counts. Listing all 17 inline made a 2718px strip at 390px — nearly 7x the viewport, with the useful categories past the fold (issue #658). The active category is always pinned into the inline set, so a filter arrived at from the sheet or from a URL still reads as selected without opening anything.
- The sheet is the alternative entry point the strip's length rule requires: a strip may stay long only while there is another way to reach what it hides.

## Delivery cadence (ADR-039)

`supplierCadences()` gives every supplier with two or more dated invoices a median gap, a frequency label (weekly/biweekly/monthly/every N days), the next expected date and a `late` flag (1.5 × the median gap, the same rule as the missing-delivery work card). The list shows it under the last-order date on both variants; `/reminders` lists the late ones.
