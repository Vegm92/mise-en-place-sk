# Feature Spec — Analytics

## Purpose

Turn confirmed invoices into spend, price-evolution and extraction-quality
dashboards — fast, via pre-aggregated materialized views, plus the trend
buckets shared by the dashboard.

## Actors

- Signed-in member (view).
- Nightly pg-boss job (refresh views).
- Admin (extraction-quality + revenue views).

## Preconditions

- Confirmed invoices; materialized views exist (migration 0005).

## Inputs

- Period/granularity params for trend; page filters.

## Outputs

- `/analytics/spend` (per supplier/item/category monthly spend from MVs).
- `/analytics/prices` (price evolution from `mv_price_snapshots`, gated on
  `supplierScores`).
- `/analytics/extraction` (quality from `mv_extraction_stats` +
  `extraction_corrections`).
- `/api/trend` bucket JSON.

## Business rules

- **Materialized views** (`mv_supplier_monthly_spend`, `mv_item_monthly_spend`,
  `mv_category_monthly_spend`, `mv_price_snapshots`, `mv_extraction_stats`)
  refreshed by `refresh_analytics_rollups()` nightly (`10 3 * * *`). Never
  derived at read time (ADR-012).
- **Category attribution** (ADR-027): every category breakdown groups by
  `COALESCE(products.category, suppliers.category, 'Other')` over a LEFT JOIN
  from the line to its product — one shared criterion in
  `src/lib/server/category-spend.ts`. `mv_category_monthly_spend` was redefined
  on it in migration 0044 (same columns, same grain, same index names). The
  supplier's tag is the fallback, so a line with no product still counts.
- **Trend** (`trend.ts`): `getTrendDataByRange(rid, range, granularity)`;
  ranges `7d/30d/90d/1y/all`, granularity `daily|weekly|monthly`; caps at
  `MAX_BUCKETS` (400); buckets built with a **local-timezone `isoDate()`** —
  never `toISOString()` (UTC shift bug).
- **Gating**: `/analytics/prices` redirects `?upgrade=prices` without
  `supplierScores`.
- **Extraction quality**: confidence distributions + user corrections
  (`extraction_corrections`) aggregated.
- Numbers from SQL aggregates are wrapped in `Number(...)` (postgres.js returns
  strings for numeric types).

## State transitions

n/a (read-only + nightly refresh).

## Data dependencies

`mv_*` views, `invoices`, `invoice_line_items`, `suppliers`, `products`,
`extraction_corrections`, `subscriptions` (gate).

## API dependencies

`/analytics/*` loads, `/api/trend` (rate-limited `trend:{user}` 60/min).

## UI dependencies

`MobileAnalyticsSpend.svelte`, `MobileAnalyticsPrices.svelte`,
`analytics/*/+page.svelte`, `TrendChart.svelte`, `Sparkline.svelte`,
`PriceTrendSparkline.svelte`, `Delta.svelte`.

## Background dependencies

Analytics MV refresh cron (`alerts.ts:648`). A missing refresh means stale data
(known fixed issue #433).

## External dependencies

None beyond the DB.

## Validation

Range/granularity normalization; tenant scope on every MV read.

## Error states

- Views not yet refreshed → stale numbers (acceptable; marked as such).
- MV missing on a fresh DB → degraded load via `safe()`.

## Edge cases

- Local-timezone boundary: `is_current` compares against `monday(today)` /
  `monthKeyStr(today)` using local keys.
- Range spanning > 400 buckets → buckets capped, granularity coerced.

## Security rules

- MV reads scoped by `restaurant_id` filter (views carry it); feature gates on
  `/analytics/prices`.

## Idempotency rules

- Refresh is `REFRESH MATERIALIZED VIEW CONCURRENTLY` (safe to re-run).

## Observability

- MV refresh is a scheduled job; failures appear in system health/admin.

## Acceptance criteria

- Spend/prices/extraction pages render from MV data within tenant scope.
- Trend buckets match local calendar weeks/months.
- Tests: `tests/trend-categories.test.ts`, `tests/db-schema.test.ts`,
  `tests/db-crud.test.ts`.

## Code notes

### `src/routes/(app)/api/trend/+server.ts`

**`const GET`**
- Rate-limited on the authenticated user, not the client IP (issue #223) — key `trend:${locals.user!.id}`, 60/min.

### `src/routes/(app)/analytics/extraction/+page.server.ts`

**`const load`**
- kpisRows, supplierRows, trendRows read from `mv_extraction_stats` (pre-aggregated); fieldRows still queries `extraction_corrections` directly — no rollup needed for the small table.

### `src/routes/(app)/analytics/extraction/+page.svelte`

**`markup`**
- Header, empty state, KPI row, middle row (most-corrected fields + accuracy trend), accuracy-by-supplier card.

### `src/routes/(app)/analytics/prices/+page.server.ts`

**`const load`**
- Reads `mv_price_snapshots` (pre-computed latest+prev price per item+supplier), replacing the self-joining window CTE that scanned all `invoice_line_items`.

### `src/routes/(app)/analytics/prices/+page.svelte`

**`markup`**
- Mobile/desktop variants; header, toolbar, summary strip, price cards grid.

### `src/routes/(app)/analytics/spend/+page.server.ts`

**`const PERIOD_DATE_SQL`**
- Month-based filters for `mv_item_monthly_spend` / `mv_category_monthly_spend`; slightly coarser than exact date ranges (always full calendar months) but correct for analytics display.

**`const load`**
- topItems, categorySpend, itemTrendRows read from pre-aggregated views; kpisRows still queries raw tables (one simple aggregate, no CTEs/window functions).

### `src/routes/(app)/analytics/spend/+page.svelte`

**`const SERIES_COLORS`**
- Spend donut — top 5 + "Other", fixed categorical hue order (never cycled).

**`markup`**
- Mobile/desktop variants; header + period picker, KPI row, charts row (top items + donut/legend), by-category card.

### `src/lib/server/trend.ts`

**`function addDays`**
- Safety cap for pathological range+granularity combos (e.g. daily + all).

**`function isoDate`**
- Local-timezone key — never `toISOString()`: it converts through UTC and silently rolls the calendar date back a day for timezones ahead of UTC.

**`function getTrendDataByRange`**
- Postgres date-key helpers for bucket boundaries; buckets span [startDate, today] at the requested granularity.
- Segments come from the line, not the invoice: line items LEFT JOINed to products, grouped by `lineCategoryExpr()` (ADR-027). An invoice with no described line items therefore contributes nothing to the trend.
- The 'Other' inside `lineCategoryExpr()` is a SQL literal, not a bound parameter: Drizzle binds a sentinel afresh on each occurrence, so a parameter renders differently in SELECT and GROUP BY and Postgres rejects it ("column suppliers.category must appear in the GROUP BY clause", 500ing the dashboard). `mergeTrendRows` still folds a NULL category in TS for the same reason it always did.
- Buckets keyed by nested Map rather than a composite string — a category is free text, so any separator would need proving it can never appear inside one.

**`type TrendRow`**
- Uncategorised spend lands in the same 'Other' bucket the budget check and budgets page use (issue #301); NULL and an explicit 'Other' are separate SQL groups, merged here or the chart renders 'Other' twice.

### `src/lib/components/mobile/MobileAnalyticsPrices.svelte`

**`markup`**
- Search, filter chips, summary 2-col, price items list.

### `src/lib/components/mobile/MobileAnalyticsSpend.svelte`

**`const SERIES_COLORS`**
- Spend donut — top 5 + "Other", fixed categorical hue order (never cycled).

**`markup`**
- Period picker chips, KPI 2-col grid, top items, by category.
