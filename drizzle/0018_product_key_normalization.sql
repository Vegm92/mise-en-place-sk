-- Migration 0018: shared product-key normalization (issue #296)
--
-- Product identity used to be the raw invoice description string, and each
-- consumer normalized differently (price shock: exact match; monthly rollup:
-- LOWER(TRIM); mv_price_snapshots: raw). mep_norm_key is the single SQL-side
-- definition of "same product" — lowercase, Spanish accents folded, whitespace
-- collapsed — and MUST stay in lockstep with normalizeProductKey in
-- src/lib/server/normalize.ts.

CREATE OR REPLACE FUNCTION mep_norm_key(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
    -- translate() folds BOTH cases of accented chars before lower() so the
    -- result does not depend on the database's lc_ctype (in the C locale
    -- lower() leaves non-ASCII uppercase like 'Ñ' untouched).
    SELECT btrim(regexp_replace(
        lower(translate(txt,
            'áéíóúüñàèìòùâêîôûäëïöçÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖÇ',
            'aeiouunaeiouaeiouaeiocAEIOUUNAEIOUAEIOUAEIOC')),
        '\s+', ' ', 'g'))
$$;

-- ── Rebuild mv_item_monthly_spend on the shared key ──────────────────────────
-- Was LOWER(TRIM(description)); now also folds accents and inner whitespace.

DROP MATERIALIZED VIEW IF EXISTS mv_item_monthly_spend;

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

CREATE UNIQUE INDEX IF NOT EXISTS mv_item_monthly_spend_pk
    ON mv_item_monthly_spend(restaurant_id, item_key, month);
CREATE INDEX IF NOT EXISTS mv_item_monthly_spend_lookup
    ON mv_item_monthly_spend(restaurant_id, month);

-- ── Rebuild mv_price_snapshots on the shared key ─────────────────────────────
-- Was partitioned by the RAW description (inconsistent with the rollup above):
-- a supplier reprinting "TOMATE PERA" as "Tomate Pera" produced two snapshot
-- rows and broke latest/previous price pairing. Partitions now use
-- mep_norm_key; `description` keeps the latest raw spelling for display.

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
    ON mv_price_snapshots(restaurant_id, supplier_id, md5(item_key));
CREATE INDEX IF NOT EXISTS mv_price_snapshots_lookup
    ON mv_price_snapshots(restaurant_id, supplier_id);
