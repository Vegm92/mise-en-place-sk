# Feature Spec — Products

## Purpose

Give every line item a stable product identity so prices are comparable over
time (normalized units, pack-aware prices) and the catalog is user-curatable.

## Actors

- Signed-in member (merge/split/alias/unit-conversion actions).
- Invoice save (resolve products per line).
- Async LLM job (match candidates for created products).

## Preconditions

- Confirmed line items; `products` table may be empty (cold start).

## Inputs

- Line item description (+ unit, quantity, price) at save.
- `(app)/api/product-aliases` confirm/reject; product merge; conversion factors.

## Outputs

- `products` rows (unique `(rid, name_key)`), `product_aliases` rows
  (`source: exact|fuzzy|llm`), `product_suggestion` notifications,
  line items back-linked (`product_id`), normalized prices.

## Business rules

- **Three-tier identity** (ADR-009, `products.ts:270-360`):
  1. **Alias** — exact `product_aliases` lookup on the raw key → `exact`.
  2. **Fuzzy** — `pg_trgm similarity(name_key, key) ≥ FUZZY_THRESHOLD` (0.42);
     writes an alias + raises `product_suggestion` (source `fuzzy`).
  3. **Create** — insert with `ON CONFLICT (rid, name_key) DO UPDATE`,
     `status='created'`; then async LLM job validates a candidate list
     (`LLM_MATCH_THRESHOLD` 0.8) and raises `product_suggestion` (source `llm`).
- **Normalization** (`normalize.ts`): `mep_norm_key` (lower/trim),
  `expandAbbreviations` (SKU prefixes, bare codes, ~19 Spanish abbreviations),
  `canonicalizeUnit` (~45 unit groups).
- **Packs** (`products.ts:63`): `parsePack` via MULTIPACK/SINGLE/COUNT regexes;
  `SIZE_TO_BASE` (docena = 12 ud); `normalizedUnitPrice = unitPrice/baseQuantity`
  rounded 4 dp.
- **Conversions**: `unit_conversions` supplier-scoped override wins over
  name-matched; unknown unit → `requiresUnitConversion` + `unit_conversion_needed`.
- **User actions** (`products.ts:404-458`): confirm/reject alias (reject splits
  product), merge (deletes orphan), unlink supplier, delete (refuses while
  linked to line items).

## State transitions

n/a for products (rows/aliases mutate); notifications go `pending → sent`.

## Data dependencies

`products`, `product_aliases`, `unit_conversions`, `invoice_line_items`,
`system_notifications`, `mv_item_monthly_spend`, `mv_price_snapshots`.

## API dependencies

`(app)/api/product-aliases`, `(app)/api/unit-conversions`, `(app)/api/stock-levels`,
`products` routes.

## UI dependencies

`products/+page.svelte`, `products/[id]/+page.svelte`, `NotificationItem.svelte`
(product suggestion CTAs).

## Background dependencies

`normalize-product` queue (pg-boss) → `processNormalizeJob`.

## External dependencies

Gemini (LLM matching only), `pg_trgm` extension.

## Validation

Category/unit/alias uniqueness; LLM `match_id` validated against sent
candidates (never arbitrary ids).

## Error states

- Delete of a linked product refused.
- LLM match unavailable → created product stands with no suggestion.

## Edge cases

- Same raw string from two suppliers — alias may be supplier-scoped.
- Pack variant ("3 x 1 kg") vs loose "1 kg" — distinct keys or normalized unit
  price comparison handles it.
- Backfill of legacy rows without `base_unit`/`product_id` (`backfill.ts`,
  `scripts/db:backfill-products`).

## Security rules

- Product/alias/conversion writes scoped to the active restaurant.

## Idempotency rules

- Unique `(rid, name_key)`; alias unique `(rid, raw_key)`; conversion unique
  `(rid, supplier_name, ingredient, purchase_unit)`.

## Observability

- `product_suggestion` notifications; usage recorded for LLM matching.

## Acceptance criteria

- A new line item resolves via alias → fuzzy → create in order, with correct
  `product_id` back-links and normalized price.
- Confirm/reject/merge persist and clear/re-split appropriately.
- Tests: `tests/product-catalog.test.ts`, `tests/product-crud.test.ts`,
  `tests/product-dictionary.test.ts`, `tests/product-normalizer.test.ts`,
  `tests/norm-key-parity.test.ts`, `tests/pack-parser.test.ts`,
  `tests/unit-bridge.test.ts`, `tests/backfill.test.ts`.
