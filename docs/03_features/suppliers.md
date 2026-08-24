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

- `suppliers` row (unique per `(rid, lower(name))`).
- `supplier_metrics` reliability scores (computed + cached).
- Supplier list rows carrying `total_spend` alongside `month_spend`.
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
- **List sort/filter** (`supplier-list.ts`, `supplier-list-query.ts`, issue #580):
  the `/suppliers` list is sorted and filtered in SQL, driven entirely by URL
  search params so a view survives reload and can be shared.
  - `sort` ∈ `spend_desc` (default), `spend_asc`, `name_asc`, `name_desc`,
    `last_invoice_desc`, `last_invoice_asc`, `reliability_desc`,
    `reliability_asc`. Anything else falls back to the default — an unvalidated
    key never reaches SQL.
  - `q` matches supplier name OR resolved category, case-insensitively; `%`,
    `_` and `\` are escaped so a wildcard typed by the user stays literal.
  - `category` must be one of `VALID_CATEGORIES`; anything else is ignored
    (no filter) rather than returning an empty list.
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

Category ∈ `VALID_CATEGORIES`; name non-empty; tenant scope. List search params
validated by `parseSupplierListParams` before any of them reaches a query.

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
- The supplier list offers 4+ sort options, a debounced text search, a category
  dropdown and an uncategorized-products toggle; all four live in the URL and
  are applied server-side (issue #580).
- Tests: `tests/supplier-category.test.ts`, `tests/supplier-contact-save.test.ts`,
  `tests/supplier-reliability-price-stability.test.ts`, `tests/db-crud.test.ts`,
  `tests/supplier-list-query.test.ts`.

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

**`property update`**
- Backfill (issue #307): products from this supplier's invoices only ever get a category at creation time (usually the 'Other' default). Editing the supplier here is the one moment a user expresses a real category, so carry it onto still-uncategorized products instead of leaving them on 'Other' forever.

**`property delete`**
- One transaction — a crash between statements must not leave invoices detached from a supplier that still exists (issue #247).

### `src/routes/(app)/suppliers/[id]/+page.svelte`

**`const SERIES_COLORS`**
- Product spend donut — top 5 + "Other", fixed categorical hue order (never cycled).

**`markup`**
- Mobile (edit form, KPI strip, tabs, info card, recent invoices, reliability, add form) and desktop supplier detail variants; `editing` toggles the edit form.

### `src/routes/(app)/suppliers/+page.server.ts`

**`const load`**
- Refreshes stale reliability scores (>24h old) for suppliers with enough invoices.
- `parseSupplierListParams(url.searchParams)` is the only door the list's view state comes through (issue #580); the parsed value — never the raw param — feeds `supplierListFilter` and `supplierListOrderBy`, so an unknown `sort` degrades to the default instead of reaching SQL.
- The filter predicate is composed *inside* `tdb.scope(suppliers.restaurantId, …)` rather than beside it, so no future filter can be added without the tenant predicate travelling with it.
- `supplier_metrics` is LEFT JOINed purely so reliability can be ordered in SQL. `supplier_metrics.supplier_id` is UNIQUE, so the join adds no rows and the invoice aggregates are unaffected. The ordering reads the *cached* score: right after a recompute the order can lag by one page load, which is why the score itself is still merged from `metricsRows` for display.
- The parsed params are echoed back in the payload so both UI variants can rebuild the URL without re-parsing it.

### `src/lib/supplier-list.ts`

**`const SUPPLIER_SORT_KEYS`**
- The closed set of sort options, shared by the loader and both UI variants. It lives outside `src/lib/server/` because the Svelte components need it to render the dropdown; it deliberately holds no Drizzle/schema import so it stays client-safe.

**`function parseSupplierListParams`**
- Validates every list search param: unknown `sort` → `DEFAULT_SUPPLIER_SORT`, unknown `category` → no category filter (an empty list would read as "this tenant has no such suppliers", which is a different and wrong answer), `q` trimmed, `uncategorized` strictly `'1'`.

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
- Sticky header (breadcrumb, supplier header, delete confirmation, edit form); tabs resumen / facturas / productos / conversiones. Resumen: monthly spend chart, KPI strip, reliability breakdown, info card, recent invoices. Productos: donut + legend with hover detail. Conversiones: add-conversion form.

### `src/lib/components/mobile/MobileSuppliersList.svelte`

**`markup`**
- Search, sort dropdown, category chips (plus an uncategorized-products chip), summary strip, list. Same URL-driven params as the desktop variant (ADR-020); the component owns no filtering, it only reports the patch through `onApply` and lets the loader answer.
