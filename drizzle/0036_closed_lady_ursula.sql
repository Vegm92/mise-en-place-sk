-- Issue #477: money columns were float4 (`real`), which loses precision
-- above ~6-7 significant digits and compounds error under SUM/aggregation.
-- Move them to numeric(12,2) — exact decimal storage, matching the pattern
-- already used for llm_usage_log.estimated_cost_usd / mrr_snapshots.mrr_cents.
--
-- Five analytics rollup materialized views (0005) read invoice_line_items /
-- invoices columns that are changing type; Postgres refuses ALTER COLUMN
-- TYPE while a view rule depends on the column, so they're dropped and
-- rebuilt around the ALTERs per docs/04_engineering/database_changes.md
-- ("Schema changes to the underlying tables must be followed by a matching
-- MV redefinition + refresh"). mv_price_snapshots_old — the pre-#424
-- rename-swap backup from migration 0034, already marked there as "drop in
-- a later, separate migration" — is dropped for good here rather than
-- rebuilt: nothing reads it and its float4 data is superseded regardless.
DROP MATERIALIZED VIEW IF EXISTS mv_supplier_monthly_spend;
DROP MATERIALIZED VIEW IF EXISTS mv_category_monthly_spend;
DROP MATERIALIZED VIEW IF EXISTS mv_item_monthly_spend;
DROP MATERIALIZED VIEW IF EXISTS mv_price_snapshots;
DROP MATERIALIZED VIEW IF EXISTS mv_price_snapshots_old;
--> statement-breakpoint

ALTER TABLE "category_budgets" ALTER COLUMN "monthly_budget" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "unit_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "total_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "normalized_unit_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "total_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "tax_base" SET DATA TYPE numeric(12, 2);--> statement-breakpoint

-- float4 -> numeric cannot recover precision already lost by the original
-- cast to real. Where an invoice has line items, re-derive total_amount as
-- the exact sum of its (now-numeric) line totals rather than keep the
-- previously-rounded float value. Invoices without summable line items keep
-- their existing (already-lossy) stored value — there's nothing to
-- reconstruct it from.
UPDATE "invoices" i
SET "total_amount" = derived.line_sum
FROM (
	SELECT "invoice_id", SUM("total_price") AS line_sum
	FROM "invoice_line_items"
	WHERE "total_price" IS NOT NULL
	GROUP BY "invoice_id"
) derived
WHERE derived."invoice_id" = i."id"
  AND i."total_amount" IS DISTINCT FROM derived.line_sum;
--> statement-breakpoint

-- Informational only (no schema/data change): flag invoices whose stored
-- total_amount could not be re-derived from line items, so operators know
-- which rows still carry pre-migration float4 rounding.
DO $$
DECLARE
	unverified_count integer;
BEGIN
	SELECT COUNT(*) INTO unverified_count
	FROM "invoices" i
	WHERE i."total_amount" IS NOT NULL
	  AND NOT EXISTS (
		SELECT 1 FROM "invoice_line_items" ili
		WHERE ili."invoice_id" = i."id" AND ili."total_price" IS NOT NULL
	  );
	IF unverified_count > 0 THEN
		RAISE NOTICE 'issue #477: % invoice(s) have total_amount with no line items to re-derive from; value kept as-is from the prior float4 column', unverified_count;
	END IF;
END $$;
--> statement-breakpoint

-- ── Rebuild the five rollup materialized views on the numeric columns ─────────

-- mv_supplier_monthly_spend — unchanged definition from migration 0005.
CREATE MATERIALIZED VIEW mv_supplier_monthly_spend AS
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

CREATE UNIQUE INDEX mv_supplier_monthly_spend_pk
    ON mv_supplier_monthly_spend(restaurant_id, supplier_id, month);
CREATE INDEX mv_supplier_monthly_spend_lookup
    ON mv_supplier_monthly_spend(restaurant_id, month);
--> statement-breakpoint

-- mv_category_monthly_spend — unchanged definition from migration 0005.
CREATE MATERIALIZED VIEW mv_category_monthly_spend AS
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

CREATE UNIQUE INDEX mv_category_monthly_spend_pk
    ON mv_category_monthly_spend(restaurant_id, category, month);
CREATE INDEX mv_category_monthly_spend_lookup
    ON mv_category_monthly_spend(restaurant_id, month);
--> statement-breakpoint

-- mv_item_monthly_spend — item_key now mep_norm_key(description) per
-- migration 0018 (product_key_normalization); carried over as-is.
CREATE MATERIALIZED VIEW mv_item_monthly_spend AS
SELECT
    i.restaurant_id,
    mep_norm_key(ili.description)  AS item_key,
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
    mep_norm_key(ili.description),
    TO_CHAR(i.invoice_date::date, 'YYYY-MM');

CREATE UNIQUE INDEX mv_item_monthly_spend_pk
    ON mv_item_monthly_spend(restaurant_id, item_key, month);
CREATE INDEX mv_item_monthly_spend_lookup
    ON mv_item_monthly_spend(restaurant_id, month);
--> statement-breakpoint

-- mv_price_snapshots — current (post-0034) definition, carried over as-is:
-- includes item_key/item_key_hash and normalized_unit_price/base_unit added
-- by 0021/0034, and the plain item_key_hash column that made
-- REFRESH CONCURRENTLY work.
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

CREATE UNIQUE INDEX mv_price_snapshots_pk
    ON mv_price_snapshots(restaurant_id, supplier_id, item_key_hash);
CREATE INDEX mv_price_snapshots_lookup
    ON mv_price_snapshots(restaurant_id, supplier_id);
