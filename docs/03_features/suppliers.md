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

## Outputs

- `suppliers` row (unique per `(rid, lower(name))`).
- `supplier_metrics` reliability scores (computed + cached).
- Category nudges/suggestions notifications.

## Business rules

- **Upsert** (`supplier.ts:13-39`): `ON CONFLICT (restaurant_id, lower(name))`
  fills missing contact via `COALESCE(suppliers.x, EXCLUDED.x)`; category
  validated against `VALID_CATEGORIES` else `'Other'`.
- **Category resolution** (`constants.ts:36`): diacritic-stripped name match;
  `'Other'` unless extraction confidence ≥ `MIN_CATEGORY_CONFIDENCE` (0.6).
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

`MobileSuppliersList.svelte`, `DesktopSuppliersList.svelte`,
`DesktopSupplierDetail.svelte`, `suppliers/[id]/+page.svelte`.

## Background dependencies

None (metrics computed on read/demand, cached).

## External dependencies

None.

## Validation

Category ∈ `VALID_CATEGORIES`; name non-empty; tenant scope.

## Error states

- Category save for a supplier outside tenant → 404/403.
- Reliability computation with no invoices → defaults (20/15/17).

## Edge cases

- Same legal supplier under two spellings → treated as two suppliers unless
  name normalization collapses them.
- Extraction of contact fields for an existing supplier → COALESCE keeps the
  user's saved values.

## Security rules

- All supplier reads/writes scoped to `locals.restaurantId`.

## Idempotency rules

- Upsert is idempotent by the lower(name) unique constraint.

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
  `tests/supplier-products-aggregates.test.ts`.

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
- Accept or decline a suggested supplier category (issue #315), posted from the bell. Accept writes the category; dismiss clears the suggestion without touching the supplier.
- Category re-validated against `VALID_CATEGORIES` here — the endpoint can't write an arbitrary string into the column the budgets page groups on. Accepting only moves a supplier *out* of the uncategorised bucket, so a stale notification can't overwrite a newer manual choice.

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

**`property update`**
- Backfill (issue #307): products from this supplier's invoices only ever get a category at creation time (usually the 'Other' default). Editing the supplier here is the one moment a user expresses a real category, so carry it onto still-uncategorized products instead of leaving them on 'Other' forever.

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

### `src/routes/(app)/suppliers/+page.svelte`

**`markup`**
- Mobile / desktop supplier lists (CSS-selected variants).

## Public routes (marketing, auth, webhooks)

### `src/lib/server/supplier-reliability.ts`

**`function computePriceStability`**
- Coefficient of variation per product, then averaged — not pooled across products (issue #308). Pooling raw prices from different items (€1/kg tomato vs €6 jar of olives) reads as huge "instability" purely from price levels, even when each is rock-steady.

### `src/lib/server/supplier.ts`

**`function getOrCreateSupplierId`**
- Atomic supplier get-or-create (issue #238), replacing the select-then-insert pattern in invoice-save, the edit action and the WhatsApp bot. Backed by `uq_suppliers_rid_name` on `(restaurant_id, lower(name))`; the no-op DO UPDATE makes RETURNING yield the existing row on conflict (bare DO NOTHING returns nothing).
- Case-insensitive, whitespace-trimmed name match; pass a transaction as `exec` to run inside an enclosing save.
- Category only ever applied at creation; new suppliers default to the 'Other' bucket (issue #307) so products resolved against them don't inherit a null category (product-catalog.ts reads it at creation time). Callers may pass an extraction-proposed category (issue #315) already passed through `resolveSupplierCategory`. A conflict never overwrites an existing supplier's category — later invoices can't reclassify behind the user's back.

**`interface SupplierContactInfo`**
- Supplier-level contact fields lifted from an extracted invoice (CIF/NIF, address, email, phone); any may be null/undefined when the source document doesn't print them — never fabricated.

**`function getOrCreateSupplierId`**
- Contact fields filled with `COALESCE`, never overwritten — an existing non-null value (user-typed or earlier capture) always beats a new extraction.

### `src/lib/components/desktop/DesktopSupplierDetail.svelte`

**`const SERIES_COLORS`**
- Product spend donut — top 5 + "Other", fixed categorical hue order (never cycled).

**`const CL`**
- SVG chart constants.

**`markup`**
- Sticky header (breadcrumb, supplier header, delete confirmation, edit form); tabs resumen / facturas / productos / conversiones. Resumen: monthly spend chart, KPI strip, reliability breakdown, info card, recent invoices. Productos: donut + legend with hover detail, then the product table. Conversiones: add-conversion form.
- Product table columns: description, unit, average price, "Gasto total" (`sup.products.colSpend`), "Unidades compradas" (`sup.products.colUnits`), last purchase (issue #575). `colUnits` replaced the old `sup.products.totalQty` / "Cant. total" header — same number, the name the issue asked for — so that key was dropped rather than left as a dead duplicate.

### `src/lib/components/desktop/DesktopSuppliersList.svelte`

**`markup`**
- Filter bar, summary strip, table.

### `src/lib/components/mobile/MobileSuppliersList.svelte`

**`markup`**
- Search, category chips, summary strip, list.
