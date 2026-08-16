-- Migration 0034: fix REFRESH MATERIALIZED VIEW CONCURRENTLY on mv_price_snapshots
--
-- REFRESH ... CONCURRENTLY requires a unique index that uses only column
-- names, no expressions, no WHERE clause. mv_price_snapshots_pk indexed
-- md5(item_key) — an expression — so every nightly run of
-- refresh_analytics_rollups() has failed on this statement since #299, and
-- because all five REFRESH CONCURRENTLY calls run inside one plpgsql
-- function invocation, that failure rolled back the other four rollups too.
--
-- Fix: materialize item_key_hash as a plain output column of the view, then
-- index that column instead of the expression.
--
-- Deployed as a build-then-rename swap (per playbooks/db-migration-safety.md)
-- instead of DROP + CREATE, so readers of mv_price_snapshots never see a
-- missing relation: the new view is built and fully populated under a _v2
-- name first, then the two names trade places in one instant, catalog-only
-- transaction. The old view is kept as mv_price_snapshots_old rather than
-- dropped here — it's a real populated cache, not a throwaway — so a bad
-- swap can be undone with another instant rename. Drop it in a later,
-- separate migration once the new view has been verified in production.

DROP MATERIALIZED VIEW IF EXISTS mv_price_snapshots_v2;

CREATE MATERIALIZED VIEW mv_price_snapshots_v2 AS
WITH ordered AS (
    SELECT
        i.restaurant_id,
        s.id             AS supplier_id,
        s.name           AS supplier_name,
        mep_norm_key(ili.description) AS item_key,
        ili.description,
        ili.unit,
        i.invoice_date,
        ili.unit_price,
        ili.normalized_unit_price,
        ili.base_unit,
        ROW_NUMBER() OVER (
            PARTITION BY i.restaurant_id, mep_norm_key(ili.description), s.id
            ORDER BY i.invoice_date DESC, i.id DESC
        ) AS rn,
        LEAD(ili.unit_price) OVER (
            PARTITION BY i.restaurant_id, mep_norm_key(ili.description), s.id
            ORDER BY i.invoice_date DESC, i.id DESC
        ) AS prev_price,
        LEAD(i.invoice_date) OVER (
            PARTITION BY i.restaurant_id, mep_norm_key(ili.description), s.id
            ORDER BY i.invoice_date DESC, i.id DESC
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
    item_key,
    md5(item_key)         AS item_key_hash,
    description,
    unit,
    invoice_date          AS latest_date,
    unit_price            AS latest_price,
    normalized_unit_price AS latest_normalized_price,
    base_unit,
    prev_price,
    prev_date,
    CASE
        WHEN prev_price IS NOT NULL AND prev_price > 0
        THEN ROUND(((unit_price - prev_price) / prev_price * 100.0)::numeric, 1)
        ELSE NULL
    END AS change_pct
FROM ordered
WHERE rn = 1;

CREATE UNIQUE INDEX mv_price_snapshots_v2_pk
    ON mv_price_snapshots_v2(restaurant_id, supplier_id, item_key_hash);
CREATE INDEX mv_price_snapshots_v2_lookup
    ON mv_price_snapshots_v2(restaurant_id, supplier_id);

-- Swap: catalog-only renames, no rebuild, no window where the relation
-- readers query is missing.
BEGIN;

ALTER MATERIALIZED VIEW mv_price_snapshots RENAME TO mv_price_snapshots_old;
ALTER INDEX mv_price_snapshots_pk RENAME TO mv_price_snapshots_old_pk;
ALTER INDEX mv_price_snapshots_lookup RENAME TO mv_price_snapshots_old_lookup;

ALTER MATERIALIZED VIEW mv_price_snapshots_v2 RENAME TO mv_price_snapshots;
ALTER INDEX mv_price_snapshots_v2_pk RENAME TO mv_price_snapshots_pk;
ALTER INDEX mv_price_snapshots_v2_lookup RENAME TO mv_price_snapshots_lookup;

COMMIT;

-- mv_price_snapshots_old is intentionally left in place. Drop it in a
-- follow-up migration once refresh_analytics_rollups() has completed
-- successfully against the new mv_price_snapshots in production.
