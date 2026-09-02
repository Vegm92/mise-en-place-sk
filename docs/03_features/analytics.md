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

- `/analytics/spend` (per supplier/item/category monthly spend from MVs; top
  items and spend-by-category both render as a donut via the shared
  `DonutChart.svelte`, plus a "Gasto a lo largo del año" card with monthly
  totals for the trailing 12 months, independent of the period selector,
  issue #882).
- `/analytics/prices` (price evolution from `mv_price_snapshots`, gated on
  `supplierScores`).
- `/analytics/extraction` (quality from `mv_extraction_stats` +
  `extraction_corrections`).
- `/analytics/extraction/csv` (the raw corrections, newest first, capped at
  5000 rows — the seed for an extraction eval/regression set, issue #812).
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
  (`extraction_corrections`) aggregated. The most-corrected-fields table splits
  each field's corrections by the model's own confidence at extraction time
  (`field_confidence < 0.85` = the model flagged it; at or above = a silent
  failure), because only the second kind says the extraction prompt is wrong.
- Numbers from SQL aggregates are wrapped in `Number(...)` (postgres.js returns
  strings for numeric types).
- **Yearly spend chart** (issue #882): `/analytics/spend` load also returns
  `monthly_spend` — one `{month, total}` row per calendar month for the
  trailing 12 months (current month included), zero-filled via
  `generate_series` LEFT JOINed to `mv_category_monthly_spend` summed across
  categories. It always covers the same 12 months regardless of the page's
  period selector.

## State transitions

n/a (read-only + nightly refresh).

## Data dependencies

`mv_*` views, `invoices`, `invoice_line_items`, `suppliers`, `products`,
`extraction_corrections`, `subscriptions` (gate).

## API dependencies

`/analytics/*` loads, `/api/trend` (rate-limited `trend:{user}` 60/min).

## UI dependencies

`MobileAnalyticsSpend.svelte`, `MobileAnalyticsPrices.svelte`,
`analytics/*/+page.svelte`, `TrendLineChart.svelte`, `DonutChart.svelte`,
`Sparkline.svelte`, `PriceTrendSparkline.svelte`, `Delta.svelte`.

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
- `/analytics/spend` renders spend-by-category as a donut (with a legend
  carrying every category's name/amount/percentage) and a yearly
  spend-by-volume chart, on both desktop and mobile (issue #882).
- Tests: `tests/trend-categories.test.ts`, `tests/db-schema.test.ts`,
  `tests/db-crud.test.ts`, `tests/539-analytics-spend-empty-state.test.ts`,
  `tests/882-donut-math.test.ts`, `tests/882-spend-donut-usage.test.ts`.

## Code notes

### `src/routes/(app)/api/trend/+server.ts`

**`const GET`**
- Rate-limited on the authenticated user, not the client IP (issue #223) — key `trend:${locals.user!.id}`, 60/min.

### `src/routes/(app)/analytics/extraction/+page.server.ts`

**`const load`**
- kpisRows, supplierRows, trendRows read from `mv_extraction_stats` (pre-aggregated); fieldRows still queries `extraction_corrections` directly — no rollup needed for the small table.
- `flagged_pct` divides by the corrections that *have* a confidence, not by all of them: rows written before `field_confidence` existed (migration 0060) would otherwise read as silent failures they were never measured to be.

### `src/routes/(app)/analytics/extraction/csv/+server.ts`

**`const GET`**
- The corrections table was write-only until issue #812 — filled on every save, read by nobody, so nothing it recorded could improve the extraction. This is the export half of the fix: one row per correction with the original value, the human's value and the model's confidence, which is the shape an eval set for `extract.ts` needs. The aggregate view answers "which field fails most"; this answers "on which documents, and how".
- Capped at `MAX_ROWS` so a long-lived tenant cannot turn a download into an unbounded scan.

### `src/routes/(app)/analytics/extraction/+page.svelte`

**`markup`**
- Header (with the corrections CSV export), empty state, KPI row, middle row (most-corrected fields + accuracy trend), accuracy-by-supplier card.
- The export link carries `data-sveltekit-reload`: it is a file download, not a page the client router can render.

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
- `monthlySpendRows` (issue #882) is deliberately outside `{monthFrom, monthTo}`: it always spans `CURRENT_DATE - 11 months` through the current month via `generate_series`, so the yearly chart does not move when the page's period picker changes. The `LEFT JOIN` keeps a month with zero spend in the series instead of collapsing the x-axis.

### `src/routes/(app)/analytics/spend/+page.svelte`

**`markup`**
- Mobile/desktop variants; header + period picker, KPI row, charts row (top items donut + legend, category donut + legend), yearly spend card.
- Top items and category both build a `{label, value, color}[]` input array, then call `computeDonutSlices()` once for the legend's own `pct`/ordering — the same pure function `DonutChart.svelte` calls internally for the arcs, so the two never disagree on which slice is which.
- `seriesColor()` covers top items (issue-free categorical hue), `categoryColor()` covers the category donut — never a locally-declared color array (`design-tokens-accent-discipline.test.ts` bans that).

### `src/lib/components/mep/DonutChart.svelte` / `src/lib/donut-math.ts`

**`DonutChart.svelte`** (issue #882)
- Single donut-ring implementation, used by both the desktop spend page (top items, spend-by-category) and `MobileAnalyticsSpend.svelte` — previously each hand-drew its own `<svg>`/`stroke-dasharray` ring, twice per file. Props: `slices` (`{label, value, color}[]`), optional `total` override, optional `centerLabel`, a `valueFormatter`, and a `hovered` bindable so the host page can keep its legend rows and the ring in sync.
- `--mep-cat-*` reads as text or a small swatch but not as a large fill (`docs/03_features/albaranes_revision/README.md`) — 17 tokens, several within ΔE ~5–7 of each other. The mitigation here is a literal `var(--mep-surface)` separator line drawn at each slice boundary (`donutSeparatorAngleRad`/`donutSeparatorPoint`), plus the legend carrying every label in text, not color alone.

**`donut-math.ts`**
- `computeDonutSlices()` is generic over the slice type so callers (e.g. the top-items donut) can carry extra fields — `itemCount`, `avgPrice`, `supplierName` — through to the legend without a second pass. Zero/negative-value slices are dropped rather than drawn as a zero-length arc. Pure and DOM-free, tested directly in `tests/882-donut-math.test.ts`.
- `donutSeparatorAngleRad`/`donutSeparatorPoint` compute the boundary point for the separator line in the same pre-rotation coordinate space as the arcs (`DonutChart` rotates the whole `<svg>` -90° after the fact) — angle 0 is 3 o'clock, increasing clockwise, matching `stroke-dasharray` traversal.

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

**`markup`**
- Period picker chips, KPI 2-col grid, top items donut + legend, category donut + legend, yearly spend card — same `DonutChart`/`TrendLineChart` components and `computeDonutSlices()` call pattern as the desktop page (issue #882), sized down (`size=156`, `radius=60`) for the narrower column.
