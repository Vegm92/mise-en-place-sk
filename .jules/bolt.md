# Bolt Performance Journal ⚡

One file per optimization, under `bolt/`. **Do not add entries to this file.**

Entries used to be prepended to the top of this file, which made every pair of
concurrent Bolt PRs conflict here by construction — the same hunk, every time,
even though the two changes touched unrelated source files. Three separate
conflict resolutions on a single PR (#1093) came from this file alone and
nothing else.

## Adding an entry

Create `bolt/<date>-<module>-<what-changed>.md`, e.g.
`bolt/2026-09-09-trend-fast-spend-trend-segment-indexing.md`, and add a line to
the list below. A new file cannot conflict with another run's new file.

Keep the existing entry shape: an `## <date> - <title>` heading, then
`### 🔍 Bottleneck Analysis`, `### ⚡ Optimization`, `### 📊 Performance Impact`.

## Entries

- `2026-09-24` — [Single-pass cohort calculation and allocation elimination in `src/lib/revenue-math.ts`](bolt/2026-09-24-revenue-math-cohorts-single-pass.md)
- `2026-09-23` — [Reuse pre-calculated tenant MRR Maps in revenue math calculations](bolt/2026-09-23-revenue-math-precalculated-tenant-mrr-maps.md)
- `2026-09-22` — [Single-pass allocation-free `sparkPath` and `windowAvg` in `src/lib/pulse-math.ts`](bolt/2026-09-22-pulse-math-single-pass-sparkpath-windowavg.md)
- `2026-09-21` — [Memoize date formatters in analytics price lists and components](bolt/2026-09-21-analytics-prices-memoized-date-formatters.md)
- `2026-09-20` — [Allocation-free reference price median in `src/lib/server/price-deviations.ts`](bolt/2026-09-20-price-deviations-allocation-free-reference-median.md)
- `2026-09-10` — [Direct year-pairing and YoY change computation in `src/lib/price-yoy.ts`](bolt/2026-09-10-price-yoy-direct-year-pairing-and-yoy-change-computation.md)
- `2026-09-09` — [Fast spend trend segment indexing in `src/lib/server/trend.ts`](bolt/2026-09-09-trend-fast-spend-trend-segment-indexing.md)
- `2026-09-08` — [Memoize recipe quantity parsing and unit key resolution in `src/lib/recipes.ts`](bolt/2026-09-08-recipes-memoize-recipe-quantity-parsing-and-unit-key-resolution.md)
- `2026-09-08` — [Memoize `parsePack` and `expandAbbreviations` in `src/lib/server/products.ts`](bolt/2026-09-08-products-memoize-parsepack-and-expandabbreviations.md)
- `2026-09-08` — [Memoize `percentToFraction` and `fractionToPercent` in `src/lib/tax.ts`](bolt/2026-09-08-tax-memoize-percenttofraction-and-fractiontopercent.md)
- `2026-09-08` — [Memoize period and date range calculations in `src/lib/period.ts`](bolt/2026-09-08-period-memoize-period-and-date-range-calculations.md)
- `2026-09-08` — [Memoize category key and slug normalization in `src/lib/constants.ts`](bolt/2026-09-08-constants-memoize-category-key-and-slug-normalization.md)
- `2026-09-08` — [Memoize `fmtDate`, `fmtDateShort`, and `fmtMonthShort` in `src/lib/formatters.ts`](bolt/2026-09-08-formatters-memoize-fmtdate-fmtdateshort-and-fmtmonthshort.md)
- `2026-09-07` — [Memoize `normalizeTaxId` and `isValidSpanishTaxId` in `src/lib/tax-id.ts`](bolt/2026-09-07-tax-id-memoize-normalizetaxid-and-isvalidspanishtaxid.md)
- `2026-09-07` — [Memoize `normalizeIban` and `isValidIban` in `src/lib/iban.ts`](bolt/2026-09-07-iban-memoize-normalizeiban-and-isvalidiban.md)
- `2026-09-07` — [Memoize `normalizePhoneNumber` and `formatPhoneNumber` in `src/lib/phone.ts`](bolt/2026-09-07-phone-memoize-normalizephonenumber-and-formatphonenumber.md)
- `2026-09-07` — [Memoize money string normalization and parsing in `src/lib/money.ts`](bolt/2026-09-07-money-memoize-money-string-normalization-and-parsing.md)
- `2026-09-06` — [Optimizing `toIsoDate` validation and memoization in `src/lib/dates.ts`](bolt/2026-09-06-dates-optimizing-toisodate-validation-and-memoization.md)
- `2026-09-03` — [Memoize `parseSupplierName` and `canonicalizeUnit` in `src/lib/server/normalize.ts`](bolt/2026-09-03-normalize-memoize-parsesuppliername-and-canonicalizeunit.md)
- `2026-09-03` — [Eliminating `JSON.stringify` overhead in `src/lib/formatters.ts`](bolt/2026-09-03-formatters-eliminating-json-stringify-overhead.md)
- `2026-09-03` — [Optimizing line reconciliation key matching from O(N*M) to O(N+M) in `src/lib/server/line-reconciliation.ts`](bolt/2026-09-03-line-reconciliation-optimizing-line-reconciliation-key-matching-from-o.md)
