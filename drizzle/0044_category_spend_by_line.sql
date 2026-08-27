-- Migration 0044: attribute category spend by the LINE, not by the supplier.
--
-- mv_category_monthly_spend already summed invoice_line_items, but grouped by
-- COALESCE(suppliers.category, 'Other') — so every euro a generalist wholesaler
-- billed landed in a single bucket, usually 'Other', no matter what was on the
-- delivery note. The category now comes from the line's product, falling back
-- to the supplier's tag and then to 'Other':
--
--     COALESCE(products.category, suppliers.category, 'Other')
--
-- The join MUST be a LEFT JOIN and the fallback MUST keep the supplier tag: a
-- line whose product_id is NULL (product linking is stamped after the invoice
-- transaction commits, and unlinkSupplier nulls it on purpose) would otherwise
-- vanish from the breakdown in silence instead of falling back.
--
-- Column list, index names and grain are unchanged, so the unique index
-- (restaurant_id, category, month) that REFRESH ... CONCURRENTLY needs and
-- refresh_analytics_rollups() (migration 0005) keep working untouched.
-- idx_invoice_line_items_product_id covers the new join.
--
-- Deployed as a build-then-rename swap (same shape as migration 0034) rather
-- than DROP + CREATE, so /analytics/spend never queries a missing relation.
-- The previous view is kept as mv_category_monthly_spend_old — a populated
-- cache, not a throwaway — so a bad swap is undone with another instant
-- rename. Drop it in a follow-up migration once the new one has been verified
-- in production.

DROP MATERIALIZED VIEW IF EXISTS mv_category_monthly_spend_v2;

CREATE MATERIALIZED VIEW mv_category_monthly_spend_v2 AS
SELECT
    i.restaurant_id,
    COALESCE(p.category, s.category, 'Other') AS category,
    TO_CHAR(i.invoice_date::date, 'YYYY-MM') AS month,
    SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_spend,
    COUNT(DISTINCT i.id)           AS invoice_count
FROM invoice_line_items ili
JOIN invoices i ON i.id = ili.invoice_id
JOIN suppliers s ON s.id = i.supplier_id
LEFT JOIN products p ON p.id = ili.product_id AND p.restaurant_id = i.restaurant_id
WHERE ili.description IS NOT NULL
  AND ili.description IS DISTINCT FROM ''
  AND i.deleted_at IS NULL
  AND i.invoice_date IS NOT NULL
GROUP BY
    i.restaurant_id,
    COALESCE(p.category, s.category, 'Other'),
    TO_CHAR(i.invoice_date::date, 'YYYY-MM');

CREATE UNIQUE INDEX mv_category_monthly_spend_v2_pk
    ON mv_category_monthly_spend_v2(restaurant_id, category, month);
CREATE INDEX mv_category_monthly_spend_v2_lookup
    ON mv_category_monthly_spend_v2(restaurant_id, month);

-- Swap: catalog-only renames, no rebuild, no window where the relation
-- readers query is missing.
BEGIN;

ALTER MATERIALIZED VIEW mv_category_monthly_spend RENAME TO mv_category_monthly_spend_old;
ALTER INDEX mv_category_monthly_spend_pk RENAME TO mv_category_monthly_spend_old_pk;
ALTER INDEX mv_category_monthly_spend_lookup RENAME TO mv_category_monthly_spend_old_lookup;

ALTER MATERIALIZED VIEW mv_category_monthly_spend_v2 RENAME TO mv_category_monthly_spend;
ALTER INDEX mv_category_monthly_spend_v2_pk RENAME TO mv_category_monthly_spend_pk;
ALTER INDEX mv_category_monthly_spend_v2_lookup RENAME TO mv_category_monthly_spend_lookup;

COMMIT;
