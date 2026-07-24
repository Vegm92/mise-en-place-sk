-- Migration 0021: carry €/base-unit onto mv_price_snapshots (follow-up to #299)
--
-- Adds the latest line's normalized_unit_price + base_unit so the price
-- analytics page can show "€/kg" alongside the raw "€/unit". Additive rebuild
-- of the view from migration 0018 (same partitioning + indexes).

DROP MATERIALIZED VIEW IF EXISTS mv_price_snapshots;

CREATE MATERIALIZED VIEW mv_price_snapshots AS
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

CREATE UNIQUE INDEX IF NOT EXISTS mv_price_snapshots_pk
    ON mv_price_snapshots(restaurant_id, supplier_id, md5(item_key));
CREATE INDEX IF NOT EXISTS mv_price_snapshots_lookup
    ON mv_price_snapshots(restaurant_id, supplier_id);
