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

## Code notes

### `src/routes/(app)/products/[id]/+page.server.ts`

**`property update`**

- Both fields filled in ⇒ this product's pack size is now known; clears any pending "how many base units does this pack contain?" alerts for it.

### `src/routes/(app)/products/[id]/+page.svelte`

**`type BlockedSupplier`**

- The delete action re-renders this page with `form.suppliers` when blocked — delete requires unlinking every supplier first.

**`const confirmUnlinkOpen`**

- Per-supplier unlink: first confirmation.

**`const confirmDeleteOpen`**

- Final delete: second confirmation, only reachable once nothing is linked.

### `src/lib/server/backfill.ts`

**`type Database`**

- Backfills product links + pack fields on existing line items (follow-up to #298/#299) so history feeds analytics/price-shock. Deterministic only — reuses `resolveLineProducts` and `parsePack`, no LLM. Idempotent: re-runs skip rows already linked/priced.

**`function backfillPacks`**

- Computes pack fields + €/base for rows that don't have them yet.

**`function backfillProductLinks`**

- Resolves + links unlinked items per supplier; descriptions grouped by supplier so one resolve pass handles all their items.

### `src/lib/server/products.ts`

- Consolidated product/unit resolution (issue #351): six shallow files merged into one deep module — they implement one concern and were never used independently. Pure exports (`parsePack`, `normalizedUnitPrice`, `expandAbbreviations`, `conversionKey`, `resolveUnitFromMap`, prompt/response parsing) stay exported because the unit-test suite exercises them directly.
- Pack/format (issue #299): `SIZE_TO_BASE` maps size tokens to a base dimension + multiplier; comma = decimal separator (Spanish decimals); shapes tried in order — MULTIPACK ("6x1L"), SINGLE (first token with a real unit, so "Aceite 5L caja" picks "5L" not a stray number), COUNT ("caja 12 ud"). A bare container ("caja") with no number → null → no normalized price. `normalizedUnitPrice` = unit_price ÷ base content ("Garrafa 5L" @ 12.50 → 2.50 €/L).
- Catalog resolution (issue #298): per unique normalized key — 1) exact alias → `exact`; 2) pg_trgm ≥ `FUZZY_THRESHOLD` (0.42, conservative) → link + pending `fuzzy` alias; 3) else create product + `exact` alias. Runs inside the save transaction. `resolveLineProducts` de-dups by key so a repeated description resolves once. The fuzzy step also tries the dictionary-expanded key (issue #300). `deleteProduct` is blocked (not cascaded) while line items/aliases reference it — the UI unlinks suppliers first. `resolveUnitConversionAlerts` matches pending alerts by normalized key against the product name or aliases. Confirm/reject/merge decide the fate of pending suggestions.
- Dictionary (issue #300): `SKU_PREFIX` requires a digit in the code so words like "REFRESCO"/"ARTESANO" are never stripped; `BARE_CODE` strips only 4+ digit leading codes (3 or fewer is usually a size). Whole-token, case-insensitive; slash tokens ("s/h") kept literal; abbreviations only, no cross-product synonyms.
- LLM normalization (issue #300): pg-boss job for lines the deterministic layers couldn't match; Gemini asked whether the description is really an existing tenant product. `LLM_MATCH_THRESHOLD` (0.8) → PENDING `product_suggestion`, never a silent merge. Best-effort: any failure is swallowed so the worker/invoice never break. Cost metered via llm-quota (`normalize` caller context).
- Unit-bridge (issue #296): rules keyed by `normalizeProductKey(ingredient)` + `normalizeProductKey(unit)` via `conversionKey`, so casing/accent/spacing drift doesn't miss rules. `loadConversionMap` fetches per-supplier rules and matches in memory (few rules per supplier). `resolveUnitFromMap` falls through to recognized spellings of canonical units ("Kgs", "KILO", "KGM" → kg) with factor 1.
