---
tags: [mep, features]
related: "[[CONTEXT]]"
---

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
- `(app)/products/inventory-template` (Pro, issue #885): a physical-inventory
  `.xlsx` workbook generated from the tenant's own catalog — no upload, no
  manual template. One row per product, grouped by category, with the total
  formula already in the cell; the user only has to fill in counted
  quantities.

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
  `canonicalizeUnit` (~45 unit groups). Static RegExp instances are compiled at module scope and `normalizeProductKey` results are cached via bounded Map memoization to optimize string processing throughput.
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
- **Year-over-year price comparison** (issue #884): both the product detail
  page and the catalog show how a product's price moved against the same
  calendar year a year earlier, so whoever runs the season-start inventory
  can renegotiate with hard numbers instead of memory. The comparison prefers
  `normalizedUnitPrice` (€/base unit, ADR-009) so packs of different sizes
  stay comparable; it falls back to the raw `unitPrice` only when *both*
  years lack a normalized price and share the same raw unit, and is left
  `null` (shown as "—") for a single year, a gap year, a zero previous price,
  or genuinely mixed units — it never compares a normalized price with a raw
  one. The catalog additionally exposes `sort=yoy_desc`, ordering by the
  largest absolute change first (an increase or a decrease is equally worth a
  supplier conversation) with `null` last; the default order is untouched
  when `sort` is absent.
- **Category** (ADR-027): a product's category is its own, not the supplier's.
  A product is created with `category = NULL` and the async
  `categorize-product` job (`processCategorizeJob`) proposes one value from
  `VALID_CATEGORIES` through `resolveCategory`'s 0.6 floor. A rejected verdict
  leaves NULL — "not judged yet", shown as *Sin categorizar* on `/products` —
  which is deliberately distinct from an explicit `'Other'`. The job only ever
  fills a NULL, so a category a human set is never overwritten. This is what
  the money is split by: `COALESCE(products.category, suppliers.category,
  'Other')`.
- **Inventory template** (ADR-013/ADR-023, issue #885): a Pro-gated
  (`features.inventoryTemplate`) download that turns the tenant's own catalog
  into a ready-to-count Excel sheet — the same "generate a template from data
  already on file" idea `/invoices/export` uses for invoices, applied to
  products. `listCatalogForExport` (`products.ts`) reads one row per product
  with its latest price (normalized preferred, else raw, else blank — same
  preference `loadCatalogYoyChangeMap` uses); `buildInventoryWorkbook`
  (`inventory-template.ts`) is a pure function that groups those rows by
  category (in `VALID_CATEGORIES` order, uncategorized last), writes a `Total
  (€)` formula per product row, a `SUM` subtotal row per category and a grand
  total summing the subtotals, and leaves `Cantidad contada` empty for the
  user to fill in. Category labels go through the server-side translator
  (`renderTemplate`) so the sheet matches the request locale; the column
  headers themselves stay Spanish, same as the invoices export.

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
`(app)/products/inventory-template` (Pro-gated GET, issue #885), `products` routes.

## UI dependencies

`products/+page.svelte` (catalog warning + suggestions-tab conversion prompts +
the "Plantilla de inventario" download link), `products/[id]/+page.svelte`,
`NotificationItem.svelte` (product suggestion CTAs). The product *list* has a
dedicated mobile component (`MobileProducts.svelte`, ADR-020) rendered
alongside the desktop `ListPageTemplate` layout — CSS picks which shows,
and both carry the inventory-template link (issue #885). The product
*detail* page (`products/[id]/+page.svelte`) has no separate Mobile*/Desktop*
variant: one template covers both.

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
- From the product detail page, "Precio por año" shows every calendar year
  this product was bought, its latest price, the previous year's price and
  the % change. From the catalog, a product's row shows the same current vs
  previous year % change, and sorting by `sort=yoy_desc` surfaces the
  products whose price moved the most first.
- A restaurant on Pro can download a real inventory template generated from
  its own products at `/products/inventory-template`: one `.xlsx` row per
  product, grouped by category, unit and latest price already filled in,
  `Cantidad contada` empty for counting, and a `Total (€)` formula per row
  plus subtotal/grand-total rows. A trial/starter tenant hitting the route is
  refused (`requireFeature('inventoryTemplate', …)`, 403 in-handler; 303 to
  `/billing?upgrade=inventario` when reached through the entitlement gate).
- Tests: `tests/product-catalog.test.ts`, `tests/product-crud.test.ts`,
  `tests/product-conversion-suggestions.test.ts`,
  `tests/product-dictionary.test.ts`, `tests/product-normalizer.test.ts`,
  `tests/product-categorizer.test.ts`, `tests/norm-key-parity.test.ts`,
  `tests/pack-parser.test.ts`, `tests/unit-bridge.test.ts`,
  `tests/backfill.test.ts`, `tests/category-attribution.test.ts`,
  `tests/price-yoy.test.ts`, `tests/product-filters.test.ts`,
  `tests/xlsx-export.test.ts` (`buildInventoryWorkbook`).

## Code notes

### `src/routes/(app)/products/+page.server.ts`

**`const load`**

- Loads the catalog, the pending `product_suggestion` rows and (issue #582) the pending unit-conversion prompts in one `Promise.all`. `needsConversion` on a catalog row is the *product-level* gap (a canonical unit with no pack size); `conversionPrompts` is the *line-level* gap (a purchase unit no rule can canonicalise) — two different questions, deliberately kept apart.
- `categories` handed to the page is `selectableCategoryNames(rid)` (ADR-037 part 2, issue #881) — the restaurant's own `categories` rows plus `'Other'` — not the fixed `VALID_CATEGORIES`.

**`property create`**

- The submitted category is validated against `selectableCategoryNames(rid)`, the same list the dropdown offered — anything else is dropped to `null` rather than written.

### `src/routes/(app)/products/+page.svelte`

**`function saveConversion`**

- The suggestions tab's inline "define the conversion" form. Posts to `(app)/api/unit-conversions` — the same endpoint the notification-centre CTA links to — and re-runs `load` on success so the answered prompt disappears. A non-OK response sets a per-prompt error flag rather than a page-level one, so one bad factor doesn't blank the other prompts.

**`const pendingCount`**

- The suggestions tab badge and its empty state count product suggestions *and* conversion prompts; the tab is "sugerencias pendientes", and a pending conversion is one.

**`hasInventoryTemplate` / the "Plantilla de inventario" link**

- Reads `data.features.inventoryTemplate` — already on the page's `data` because `(app)/+layout.server.ts` puts `features: tierConfig.features` in the layout load, and SvelteKit merges ancestor layout data into `PageData` automatically. The link is always rendered (issue #885's design decision): a non-Pro tenant sees the same link plus a neutral `nav.badge.pro` chip, and `/products/inventory-template`'s own `ROUTE_POLICY` entry is what actually turns the click into a redirect to `/billing?upgrade=inventario` — the page never duplicates that gating logic, it just signals it visually. `data-sveltekit-reload` forces a full navigation for the same reason `/invoices/export`'s download form does (issue #747): it is a file download, not a route the client router should try to render. `MobileProducts.svelte` carries the same link/chip behind a `features` prop for the same reason (ADR-020).

### `src/routes/(app)/products/[id]/+page.server.ts`

**`const load`**

- `categories` handed to the page is `selectableCategoryNames(rid)` (ADR-037 part 2, issue #881), not the fixed `VALID_CATEGORIES`.

**`property update`**

- Both fields filled in ⇒ this product's pack size is now known; clears any pending "how many base units does this pack contain?" alerts for it.
- The submitted category is validated against `selectableCategoryNames(rid)`, same list the dropdown offered.

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
- Catalog resolution (issue #298): per unique normalized key — 1) exact alias → `exact`; 2) pg_trgm ≥ `FUZZY_THRESHOLD` (0.42, conservative) → link + pending `fuzzy` alias; 3) else create product + `exact` alias. Runs inside the save transaction. `resolveLineProducts` pre-computes normalized keys for line items and de-dups by key so repeated descriptions resolve once without redundant inner-loop normalization calls. The fuzzy step also tries the dictionary-expanded key (issue #300). `deleteProduct` is blocked (not cascaded) while line items/aliases reference it — the UI unlinks suppliers first. `resolveUnitConversionAlerts` matches pending alerts by normalized key against the product name or aliases. Confirm/reject/merge decide the fate of pending suggestions.
- Manual reassignment (issue #812): the automatic match used to be invisible and final — a wrong fuzzy link (or a new product created from a misread description) could only be repaired afterwards from the products screen, if anyone noticed. `previewLineProducts` answers "what would this line match to?" without writing anything, so the review screen can show it while the invoice is still correctable; `assignLineProduct` is the write half, re-pointing the alias at the reviewer's choice with `source='user'` and `confirmed_at` set, so the decision holds for later invoices instead of being re-guessed. `listProductOptions` feeds the picker. The preview mirrors `resolveOne`'s order (supplier SKU / exact alias → pg_trgm ≥ `FUZZY_THRESHOLD` → would-create) — if the two disagreed, the screen would promise a match the save does not make.
- Dictionary (issue #300): `SKU_PREFIX` requires a digit in the code so words like "REFRESCO"/"ARTESANO" are never stripped; `BARE_CODE` strips only 4+ digit leading codes (3 or fewer is usually a size). Whole-token, case-insensitive; slash tokens ("s/h") kept literal; abbreviations only, no cross-product synonyms.
- LLM normalization (issue #300): pg-boss job for lines the deterministic layers couldn't match; Gemini asked whether the description is really an existing tenant product. `LLM_MATCH_THRESHOLD` (0.8) → PENDING `product_suggestion`, never a silent merge. Best-effort: any failure is swallowed so the worker/invoice never break. Cost metered via llm-quota (`normalize` caller context).
- Unit-bridge (issue #296): rules keyed by `normalizeProductKey(ingredient)` + `normalizeProductKey(unit)` via `conversionKey`, so casing/accent/spacing drift doesn't miss rules. `loadConversionMap` fetches per-supplier rules and matches in memory (few rules per supplier). `resolveUnitFromMap` falls through to recognized spellings of canonical units ("Kgs", "KILO", "KGM" → kg) with factor 1. `loadConversionMap`/`resolveUnit`/`annotateLineItems` take an optional trailing `database` argument defaulting to the app pool — the seam DB-backed tests use to run against the test connection instead of the module-level singleton. The supplier-name branch matches on `mep_norm_key(supplier_name)` (issue #582): the extraction worker and `enrichLineItems` look rules up by name only (no `supplier_id`), while every writer stores the supplier's real name, so a plain lowercase comparison silently missed every rule saved for a supplier whose name is not already lowercase.
- Conversion prompts (issue #582): `loadConversionPrompts` reads the pending `unit_conversion_needed` alerts, parses each JSON payload defensively (a legacy or non-JSON payload is skipped rather than aborting the page load), keys them by `supplierConversionKey` = normalized supplier + `conversionKey`, drops the ones a `unit_conversions` row already answers and keeps only the newest alert per key — the same supplier re-billing the same unit must not produce N identical prompts. `defineUnitConversion` is the single write path behind both the API route and the suggestions tab: validate → upsert on the `(rid, supplier_name, ingredient, purchase_unit)` unique index → clear `requires_unit_conversion` (+ set `canonical_unit`) on this tenant's matching line items for that supplier → flip matching pending alerts to `sent`, returning how many it closed. Normalized keys are computed in TS and compared against `mep_norm_key(...)` in SQL, which the norm-key-parity test keeps in lockstep.
- Output contract (issue #842): `processNormalizeJob`/`processCategorizeJob` pass `NORMALIZE_VERDICT_SCHEMA`/`CATEGORIZE_VERDICT_SCHEMA` to `provider.generate` (`responseMimeType`/`responseSchema`) instead of relying on prompt prose ("Responde SOLO con JSON: …") alone. `parseNormalizeResponse`/`parseCategorizeResponse` already returned a safe default rather than throwing on a bad reply, so their behaviour is unchanged — they now go through the shared `parseJsonResponse` (`llm-json.ts`) for the parse step, with `isRawNormalizeVerdict`/`isRawCategorizeVerdict` narrowing only "is this an object" (the existing `typeof` field checks below still do the real per-field validation). `stripJsonFence` (`llm-json.ts`) is kept as `parseJsonResponse`'s fallback for a fenced reply, not the primary path.
- Category verdict scoping (ADR-037 part 2, issue #881): `parseCategorizeResponse` stays a pure canonicalisation against the fixed extraction guide (`resolveCategory`/`VALID_CATEGORIES`) — the prompt itself is still the global default list (ADR-037's Decision: a restaurant's custom categories are never AI-suggested). `processCategorizeJob` then re-checks that canonical name through `resolveCategoryFor(restaurantId, category, undefined, database)` before writing: if it degrades to `'Other'` (the restaurant hid that default category), the job leaves the product `NULL` rather than stamping it `'Other'` — same "never a literal Other" rule the pure parse already followed for a low-confidence/invented verdict.
- Catalog export (issue #885): `listCatalogForExport` reads one row per product — id, name, category, unit — plus its latest price via a `LEFT JOIN LATERAL` on `invoice_line_items`/`invoices` (`ORDER BY invoice_date DESC, id DESC LIMIT 1`, same "latest wins" ordering as the YoY queries below), preferring `normalized_unit_price` over the raw `unit_price` and leaving it `null` for a product never purchased. Feeds `/products/inventory-template`; the SQL text carries `restaurant_id = ${restaurantId}` the same way `loadConversionPrompts`/`loadCatalogYoyChangeMap` do, so it is intentionally not `forTenant().scope()`.
- Year-over-year price (issue #884): `loadProductYearlyPrices` (one product, every year, via `SELECT DISTINCT ON (year) … ORDER BY year, invoice_date DESC, id DESC`) and `loadCatalogYoyChangeMap` (whole catalog, current + previous year only, via a `ROW_NUMBER() OVER (PARTITION BY product_id, year …)` window so only the latest line per product per year survives) both read `invoice_line_items`/`invoices` directly — tenant-scoped by `restaurant_id = ${restaurantId}` in the SQL text rather than `forTenant().scope()`, matching every other raw-`sql` query already in this file (`loadConversionPrompts`, `loadConversionMap`). Neither writes anything, so both take a `database` argument the same way the rest of the module does, no default. The two rows always carry the same shape (`YearlyPriceInput` from `$lib/price-yoy`) via the shared `toYearlyPriceInput`/`YearlyPriceDbRow` conversion, so the actual "pair years, prefer normalized, fall back to raw only same-unit" math lives once, in `price-yoy.ts`, and both this module and the two route `load()`s just call it.

### `src/lib/server/inventory-template.ts`

- `buildInventoryWorkbook(rows, locale, categoryOrder?)` (issue #885) is a pure function — no DB, no request — so the workbook shape (grouping, formulas, subtotal/grand-total rows) is unit-tested directly in `tests/xlsx-export.test.ts` instead of only through a route-level round trip. Groups `CatalogExportRow[]` by `category` and orders the groups by position in `categoryOrder` (an unrecognized/free-text category sorts after every named one, `null` last of all) rather than by first appearance in the input, so the sheet reads the same regardless of the catalog's SQL order. `categoryOrder` defaults to the `VALID_CATEGORIES`-derived order (what the pure tests exercise); the real route (`/products/inventory-template`) instead passes `selectableCategoryNames(rid)` — the restaurant's own `categories.sortOrder`, `'Other'` last (ADR-037 part 2, issue #881) — so a custom category's rows land wherever the restaurant ordered it, not off the end. `categoryLabel` renders `category.<slug>` through the same translator the rest of the app uses for category names, falling back to the raw category string when a free-text value has no matching key — never the untranslated key itself (this already covers a custom category's stored name, since it has no `category.*` i18n key either).  Each product row's `Total (€)` cell is the ExcelJS formula object `{ formula: 'D{row}*E{row}' }` (price × counted quantity); each category's subtotal row sums that category's `Total` cells (`SUM(F{first}:F{last})`); the final row sums the subtotal cells. `Cantidad contada` is the only column left unlocked (`cell.protection = { locked: false }`) and highlighted — everything else is read-only data the user didn't have to type.

### `src/lib/server/xlsx-style.ts`

- Extracted from `invoices/export/download/+server.ts` (issue #885) once `inventory-template.ts` needed the same header/banding look — `HEADER_FILL`/`BAND_FILL`/`THIN_BORDER` plus the `styleHeaderRow`/`styleBandedRows` helpers that applied them are shared rather than copy-pasted so the two xlsx exports can't drift apart in appearance.

### `src/routes/(app)/products/inventory-template/+server.ts`

- GET only (issue #885). Tenant rate limit (`rateLimitScoped({ scope: 'tenant', name: 'inventory-template', max: 10 })`) then `requireFeature('inventoryTemplate', locals)` — the same in-handler guard `(app)/api/stock-levels` uses, on top of the `ROUTE_POLICY` entry that redirects a page-level hit before the handler even runs. `listCatalogForExport` + `selectableCategoryNames(rid)` (ADR-037 part 2, issue #881) run together, then feed `buildInventoryWorkbook`; this file is otherwise the request/response plumbing plus the `inventario-<YYYY-MM-DD>.xlsx` filename via `contentDispositionHeader`.

### `src/lib/price-yoy.ts`

- Pure module (issue #884), no DB/Svelte imports, so both `products/[id]/+page.server.ts` (one product, full year series) and `products/+page.server.ts` (whole catalog, current vs previous year only via `loadCatalogYoyChangeMap`) share one comparison rule. `pairYearlyPrices` pairs year *N* with year *N-1* specifically (a `Map` keyed by year, looked up at `year - 1`) — not "the previous data point" — so a gap year (no purchase at all the year before) correctly yields `changePct: null` rather than comparing across the gap. `comparablePrevPrice` is the ADR-009 rule: both years normalized → compare those; both lacking a normalized price and sharing the same raw `unit` → compare `unitPrice`; anything else (one normalized and the other not, or different raw units) → `null`, never a cross-comparison. `prevPrice` itself can still surface as `0` (a real, if unusual, previous price) while `changePct` stays `null` — the div-by-zero guard is on the percentage, not on showing what the previous price actually was. Formatting the resulting `changePct` for display is not in this module: `formatYoyPct(pct, locale)` lives in `src/lib/formatters.ts` next to `fmtEurSigned`, since it needs `Locale`/`toIntlLocale` — `Intl.NumberFormat(…, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })` for a locale-correct decimal separator (`,` es / `.` en) and sign, the same pattern `fmtEurSigned` already used for money.

### `src/lib/product-filters.ts`

- Mirrors `src/lib/invoice-filters.ts`'s shape (issue #884) but only for the one thing the catalog's `sort` param needs: `PRODUCT_SORT_KEYS`/`isProductSortKey`/`parseProductSort` (unknown or absent → `DEFAULT_PRODUCT_SORT = 'name'`, which also means "leave the SQL's `ORDER BY canonical_name` alone" — `sortProducts` returns the input array untouched for anything but `'yoy_desc'`, it does not re-sort by name in TS). `sortProductsByYoy` sorts by `Math.abs(changePct)` descending, `null` last — a big drop is exactly as worth a supplier call as a big rise, so the sign is discarded for ordering (still shown, and colored, in the row itself).

### `src/routes/(app)/products/+page.server.ts`

**`const load`**

- `currentYear`/`loadCatalogYoyChangeMap` join into `mappedProducts` by `p.id` in TS rather than joining in SQL, same "second query joined in TS" shape the file already used for `needsConversion`/`conversionPrompts`. `sortProducts(mappedProducts, sort)` is applied last, after the map — the catalog's own `SELECT … ORDER BY p.canonical_name` still owns the default order.

### `src/routes/(app)/products/[id]/+page.server.ts`

**`const load`**

- `priceByYear` is `pairYearlyPrices(yearlyPrices)` over *every* year `loadProductYearlyPrices` returns for this one product (unlike the catalog, which only ever needs two years) — the detail page's "Precio por año" card shows the full series.
