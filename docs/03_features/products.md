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
- **Conversion prompts in the suggestions tab** (issue #582): the pending
  `unit_conversion_needed` alerts are surfaced as prompts alongside the product
  suggestions (`loadConversionPrompts`), de-duplicated per
  supplier+ingredient+purchase-unit and dropped once a matching rule exists.
  Answering one posts to `(app)/api/unit-conversions`, which writes the
  `unit_conversions` row, clears `requires_unit_conversion` on the matching
  line items and flips the alert to `sent` — all through the single
  `defineUnitConversion` helper.
- **User actions** (`products.ts:404-458`): confirm/reject alias (reject splits
  product), merge (deletes orphan), unlink supplier, delete (refuses while
  linked to line items).
- **Category** (ADR-027): a product's category is its own, not the supplier's.
  A product is created with `category = NULL` and the async
  `categorize-product` job (`processCategorizeJob`) proposes one value from
  `VALID_CATEGORIES` through `resolveCategory`'s 0.6 floor. A rejected verdict
  leaves NULL — "not judged yet", shown as *Sin categorizar* on `/products` —
  which is deliberately distinct from an explicit `'Other'`. The job only ever
  fills a NULL, so a category a human set is never overwritten. This is what
  the money is split by: `COALESCE(products.category, suppliers.category,
  'Other')`.

## State transitions

n/a for products (rows/aliases mutate); notifications go `pending → sent`.

- **Allergens and nutrition** (issue: recipe costing): `products` carries the
  fourteen EU allergen codes and the four per-100 macros, each with a
  `source` column (`manual` | `extracted`). A user editing them on
  `/products/[id]` stamps `manual`. Extraction may fill an allergen set that is
  still empty via `applyExtractedAllergens`, which never overwrites a `manual`
  value and raises `product_allergens_suggested` for confirmation. Recipe lines
  linked to the product inherit both unless the line declares its own.

## Data dependencies

`products`, `product_aliases`, `unit_conversions`, `invoice_line_items`,
`system_notifications`, `mv_item_monthly_spend`, `mv_price_snapshots`.

## API dependencies

`(app)/api/product-aliases`, `(app)/api/unit-conversions`, `(app)/api/stock-levels`,
`products` routes.

## UI dependencies

`products/+page.svelte` (catalog warning + suggestions-tab conversion prompts),
`products/[id]/+page.svelte`, `NotificationItem.svelte`
(product suggestion CTAs). The Products list page is a single responsive
component built on `ListPageTemplate` — it has no separate Mobile*/Desktop*
variants (ADR-020).

## Background dependencies

`normalize-product` queue (pg-boss) → `processNormalizeJob`;
`categorize-product` queue (pg-boss) → `processCategorizeJob`. Both have a
dead-letter queue and record LLM usage.

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
  `pnpm db:backfill-products`); it creates products with no category, which the
  categorisation backfill then picks up.
- Backfill of the existing catalogue's categories: `pnpm
  db:backfill-product-categories` queues one `categorize-product` job per
  uncategorised product (`--include-other` also resets products stamped
  `'Other'` by the pre-ADR-027 supplier inheritance). The worker does the work;
  it costs one LLM call per product.

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
- The suggestions tab lists a conversion prompt for every unanswered
  `unit_conversion_needed` alert; defining one from there stores a tenant-scoped
  `unit_conversions` row, closes the alert, and is consulted by the next
  extraction (`annotateLineItems`).
- Tests: `tests/product-catalog.test.ts`, `tests/product-crud.test.ts`,
  `tests/product-conversion-suggestions.test.ts`,
  `tests/product-dictionary.test.ts`, `tests/product-normalizer.test.ts`,
  `tests/product-categorizer.test.ts`, `tests/norm-key-parity.test.ts`,
  `tests/pack-parser.test.ts`, `tests/unit-bridge.test.ts`,
  `tests/backfill.test.ts`, `tests/category-attribution.test.ts`.

## Code notes

### `src/routes/(app)/products/+page.server.ts`

**`const load`**

- Loads the catalog, the pending `product_suggestion` rows and (issue #582) the pending unit-conversion prompts in one `Promise.all`. `needsConversion` on a catalog row is the *product-level* gap (a canonical unit with no pack size); `conversionPrompts` is the *line-level* gap (a purchase unit no rule can canonicalise) — two different questions, deliberately kept apart.

### `src/routes/(app)/products/+page.svelte`

**`function saveConversion`**

- The suggestions tab's inline "define the conversion" form. Posts to `(app)/api/unit-conversions` — the same endpoint the notification-centre CTA links to — and re-runs `load` on success so the answered prompt disappears. A non-OK response sets a per-prompt error flag rather than a page-level one, so one bad factor doesn't blank the other prompts.

**`const pendingCount`**

- The suggestions tab badge and its empty state count product suggestions *and* conversion prompts; the tab is "sugerencias pendientes", and a pending conversion is one.

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
- Unit-bridge (issue #296): rules keyed by `normalizeProductKey(ingredient)` + `normalizeProductKey(unit)` via `conversionKey`, so casing/accent/spacing drift doesn't miss rules. `loadConversionMap` fetches per-supplier rules and matches in memory (few rules per supplier). `resolveUnitFromMap` falls through to recognized spellings of canonical units ("Kgs", "KILO", "KGM" → kg) with factor 1. `loadConversionMap`/`resolveUnit`/`annotateLineItems` take an optional trailing `database` argument defaulting to the app pool — the seam DB-backed tests use to run against the test connection instead of the module-level singleton. The supplier-name branch matches on `mep_norm_key(supplier_name)` (issue #582): the extraction worker and `enrichLineItems` look rules up by name only (no `supplier_id`), while every writer stores the supplier's real name, so a plain lowercase comparison silently missed every rule saved for a supplier whose name is not already lowercase.
- Conversion prompts (issue #582): `loadConversionPrompts` reads the pending `unit_conversion_needed` alerts, parses each JSON payload defensively (a legacy or non-JSON payload is skipped rather than aborting the page load), keys them by `supplierConversionKey` = normalized supplier + `conversionKey`, drops the ones a `unit_conversions` row already answers and keeps only the newest alert per key — the same supplier re-billing the same unit must not produce N identical prompts. `defineUnitConversion` is the single write path behind both the API route and the suggestions tab: validate → upsert on the `(rid, supplier_name, ingredient, purchase_unit)` unique index → clear `requires_unit_conversion` (+ set `canonical_unit`) on this tenant's matching line items for that supplier → flip matching pending alerts to `sent`, returning how many it closed. Normalized keys are computed in TS and compared against `mep_norm_key(...)` in SQL, which the norm-key-parity test keeps in lockstep.
