-- mv_supplier_monthly_spend, mv_category_monthly_spend, mv_item_monthly_spend,
-- mv_price_snapshots (0036) all read invoices.invoice_date; Postgres refuses
-- ALTER COLUMN TYPE while a view rule depends on the column, so they're
-- dropped and rebuilt around the ALTERs (same pattern as 0036).
DROP MATERIALIZED VIEW IF EXISTS mv_supplier_monthly_spend;--> statement-breakpoint
DROP MATERIALIZED VIEW IF EXISTS mv_category_monthly_spend;--> statement-breakpoint
DROP MATERIALIZED VIEW IF EXISTS mv_item_monthly_spend;--> statement-breakpoint
DROP MATERIALIZED VIEW IF EXISTS mv_price_snapshots;--> statement-breakpoint
UPDATE "invoices" SET "invoice_date" = NULL WHERE btrim("invoice_date") = '';--> statement-breakpoint
UPDATE "invoices" SET "due_date" = NULL WHERE btrim("due_date") = '';--> statement-breakpoint
DO $$
DECLARE bad_count bigint;
BEGIN
	SELECT count(*) INTO bad_count FROM "invoices"
	WHERE ("invoice_date" IS NOT NULL AND "invoice_date" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
	   OR ("due_date"     IS NOT NULL AND "due_date"     !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
	IF bad_count > 0 THEN
		RAISE EXCEPTION 'invoices has % row(s) with a non-ISO invoice_date/due_date; repair them before migrating (see drizzle/0039_invoice_dates_typed.audit.sql)', bad_count;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "invoice_date" SET DATA TYPE date USING "invoice_date"::date;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DATA TYPE date USING "due_date"::date;--> statement-breakpoint
ALTER TABLE "category_budgets" ADD CONSTRAINT "category_budgets_month_format" CHECK ("category_budgets"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "acquisition_costs" ADD CONSTRAINT "acquisition_costs_month_format" CHECK ("acquisition_costs"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "monthly_usage" ADD CONSTRAINT "monthly_usage_month_format" CHECK ("monthly_usage"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "mrr_snapshots" ADD CONSTRAINT "mrr_snapshots_month_format" CHECK ("mrr_snapshots"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint

-- Rebuild the four rollup materialized views dropped above. Definitions are
-- unchanged from 0036 — invoice_date is now `date`, so the ::date casts
-- below are no-ops kept for minimal diff against the 0036 source.
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
