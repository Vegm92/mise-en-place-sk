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
