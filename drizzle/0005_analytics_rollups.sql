-- Migration: analytics rollup views and missing indexes (issue #127)
-- Eliminates per-request fan-out on dashboard and analytics pages.
-- Pages read from pre-aggregated views; a nightly pg_cron job refreshes them.

-- ── 1. Missing indexes ────────────────────────────────────────────────────────

-- Covers TO_CHAR(invoice_date::date,'YYYY-MM') range scans used by dashboard
-- and analytics pages. Partial: only non-deleted invoices are ever queried.
CREATE INDEX IF NOT EXISTS idx_invoices_rid_invoice_date
    ON invoices(restaurant_id, invoice_date)
    WHERE deleted_at IS NULL;

-- Covers unit_price IS NOT NULL filter in price analytics window query.
CREATE INDEX IF NOT EXISTS idx_ili_unit_price
    ON invoice_line_items(restaurant_id, unit_price)
    WHERE unit_price IS NOT NULL;

-- ── 2. Materialized views ─────────────────────────────────────────────────────

-- mv_supplier_monthly_spend
-- One row per (restaurant, supplier, month). Used by dashboard supplier cards.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_supplier_monthly_spend AS
SELECT
    i.restaurant_id,
    i.supplier_id,
    s.name                         AS supplier_name,
    COALESCE(s.category, 'Other')  AS category,
    TO_CHAR(i.invoice_date::date, 'YYYY-MM') AS month,
    SUM(COALESCE(i.total_amount, 0))  AS total_spend,
    COUNT(i.id)                       AS invoice_count,
    COUNT(CASE WHEN i.status = 'pending' THEN 1 END) AS pending_count
FROM invoices i
JOIN suppliers s ON s.id = i.supplier_id
WHERE i.deleted_at IS NULL
  AND i.invoice_date IS NOT NULL
GROUP BY
    i.restaurant_id, i.supplier_id, s.name,
    COALESCE(s.category, 'Other'),
    TO_CHAR(i.invoice_date::date, 'YYYY-MM');

CREATE UNIQUE INDEX IF NOT EXISTS mv_supplier_monthly_spend_pk
    ON mv_supplier_monthly_spend(restaurant_id, supplier_id, month);
CREATE INDEX IF NOT EXISTS mv_supplier_monthly_spend_lookup
    ON mv_supplier_monthly_spend(restaurant_id, month);

-- mv_item_monthly_spend
-- One row per (restaurant, normalised description, month).
-- Used by spend analytics top-items, KPI totals, and sparkline trends.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_item_monthly_spend AS
SELECT
    i.restaurant_id,
    LOWER(TRIM(ili.description))   AS item_key,
    MIN(ili.description)           AS description,
    TO_CHAR(i.invoice_date::date, 'YYYY-MM') AS month,
    SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_spend,
    COUNT(*)                       AS line_count,
    AVG(NULLIF(ili.unit_price, 0)) AS avg_unit_price,
    STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name) AS supplier_names
FROM invoice_line_items ili
JOIN invoices i ON i.id = ili.invoice_id
JOIN suppliers s ON s.id = i.supplier_id
WHERE ili.description IS NOT NULL
  AND ili.description != ''
  AND i.deleted_at IS NULL
  AND i.invoice_date IS NOT NULL
GROUP BY
    i.restaurant_id,
    LOWER(TRIM(ili.description)),
    TO_CHAR(i.invoice_date::date, 'YYYY-MM');

CREATE UNIQUE INDEX IF NOT EXISTS mv_item_monthly_spend_pk
    ON mv_item_monthly_spend(restaurant_id, item_key, month);
CREATE INDEX IF NOT EXISTS mv_item_monthly_spend_lookup
    ON mv_item_monthly_spend(restaurant_id, month);

-- mv_category_monthly_spend
-- One row per (restaurant, supplier category, month).
-- Used by spend analytics category breakdown.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_category_monthly_spend AS
SELECT
    i.restaurant_id,
    COALESCE(s.category, 'Other')  AS category,
    TO_CHAR(i.invoice_date::date, 'YYYY-MM') AS month,
    SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_spend,
    COUNT(DISTINCT i.id)           AS invoice_count
FROM invoice_line_items ili
JOIN invoices i ON i.id = ili.invoice_id
JOIN suppliers s ON s.id = i.supplier_id
WHERE ili.description IS NOT NULL
  AND ili.description != ''
  AND i.deleted_at IS NULL
  AND i.invoice_date IS NOT NULL
GROUP BY
    i.restaurant_id,
    COALESCE(s.category, 'Other'),
    TO_CHAR(i.invoice_date::date, 'YYYY-MM');

CREATE UNIQUE INDEX IF NOT EXISTS mv_category_monthly_spend_pk
    ON mv_category_monthly_spend(restaurant_id, category, month);
CREATE INDEX IF NOT EXISTS mv_category_monthly_spend_lookup
    ON mv_category_monthly_spend(restaurant_id, month);

-- mv_price_snapshots
-- One row per (restaurant, supplier, item) — the LATEST price with the
-- previous price embedded via LEAD(). Replaces the self-joining window CTE
-- on the price-tracking analytics page.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_price_snapshots AS
WITH ordered AS (
    SELECT
        i.restaurant_id,
        s.id             AS supplier_id,
        s.name           AS supplier_name,
        ili.description,
        ili.unit,
        i.invoice_date,
        ili.unit_price,
        ROW_NUMBER() OVER (
            PARTITION BY i.restaurant_id, ili.description, s.id
            ORDER BY i.invoice_date DESC
        ) AS rn,
        LEAD(ili.unit_price) OVER (
            PARTITION BY i.restaurant_id, ili.description, s.id
            ORDER BY i.invoice_date DESC
        ) AS prev_price,
        LEAD(i.invoice_date) OVER (
            PARTITION BY i.restaurant_id, ili.description, s.id
            ORDER BY i.invoice_date DESC
        ) AS prev_date
    FROM invoice_line_items ili
    JOIN invoices  i ON i.id  = ili.invoice_id
    JOIN suppliers s ON s.id  = i.supplier_id
    WHERE ili.unit_price IS NOT NULL
      AND ili.description IS NOT NULL
      AND ili.description != ''
      AND i.deleted_at IS NULL
)
SELECT
    restaurant_id,
    supplier_id,
    supplier_name,
    description,
    unit,
    invoice_date  AS latest_date,
    unit_price    AS latest_price,
    prev_price,
    prev_date,
    CASE
        WHEN prev_price IS NOT NULL AND prev_price > 0
        THEN ROUND(((unit_price - prev_price) / prev_price * 100.0)::numeric, 1)
        ELSE NULL
    END AS change_pct
FROM ordered
WHERE rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS mv_price_snapshots_pk
    ON mv_price_snapshots(restaurant_id, supplier_id, md5(description));
CREATE INDEX IF NOT EXISTS mv_price_snapshots_lookup
    ON mv_price_snapshots(restaurant_id, supplier_id);

-- mv_extraction_stats
-- One row per invoice with its correction count and month bucket.
-- Replaces the repeated invoice_corrections CTEs on the extraction analytics page.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_extraction_stats AS
SELECT
    i.restaurant_id,
    i.id                                  AS invoice_id,
    i.supplier_id,
    DATE_TRUNC('month', i.created_at)     AS month,
    COUNT(ec.id)                          AS correction_count
FROM invoices i
LEFT JOIN extraction_corrections ec
       ON ec.invoice_id    = i.id
      AND ec.restaurant_id = i.restaurant_id
WHERE i.restaurant_id IS NOT NULL
GROUP BY i.restaurant_id, i.id, i.supplier_id,
         DATE_TRUNC('month', i.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS mv_extraction_stats_pk
    ON mv_extraction_stats(restaurant_id, invoice_id);
CREATE INDEX IF NOT EXISTS mv_extraction_stats_lookup
    ON mv_extraction_stats(restaurant_id, month);

-- ── 3. Refresh function ───────────────────────────────────────────────────────

-- Called by pg_cron nightly. CONCURRENTLY avoids locking readers.
-- Requires UNIQUE indexes above to already exist (they do).
CREATE OR REPLACE FUNCTION refresh_analytics_rollups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_supplier_monthly_spend;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_item_monthly_spend;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_monthly_spend;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_price_snapshots;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_extraction_stats;
END;
$$;

-- ── 4. Nightly schedule ───────────────────────────────────────────────────────
-- Enable pg_cron in the Supabase dashboard, then run once in the SQL editor:
--
--   SELECT cron.schedule(
--       'nightly-analytics-rollup',
--       '0 3 * * *',
--       'SELECT refresh_analytics_rollups()'
--   );
--
-- To cancel: SELECT cron.unschedule('nightly-analytics-rollup');
