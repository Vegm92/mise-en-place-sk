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
- Tests: `tests/supplier-category.test.ts`, `tests/supplier-contact-save.test.ts`,
  `tests/supplier-reliability-price-stability.test.ts`, `tests/db-crud.test.ts`.
