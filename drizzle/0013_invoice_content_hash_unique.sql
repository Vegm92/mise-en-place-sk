-- Migration 0013: content-hash dedup becomes a hard constraint (issue #237)
--
-- saveReviewedInvoice pre-checks invoices.content_hash then inserts, but the
-- backing index was plain, not unique. Two concurrent double-click saves of an
-- invoice with no invoice number (NULL → uq_invoices_rid_supplier_number does
-- not apply) both passed the pre-check and both inserted. Promote the index to
-- UNIQUE so the second insert loses the race via ON CONFLICT DO NOTHING (empty
-- RETURNING is already treated as a duplicate by the app).

-- 1) Collapse any pre-existing collisions: keep the earliest non-deleted
--    invoice per (restaurant_id, content_hash) and soft-delete the rest, so the
--    partial unique index (deleted_at IS NULL) can be built.
WITH ranked AS (
	SELECT id,
	       row_number() OVER (
	           PARTITION BY restaurant_id, content_hash
	           ORDER BY id
	       ) AS rn
	FROM invoices
	WHERE content_hash IS NOT NULL AND deleted_at IS NULL
)
UPDATE invoices i
SET deleted_at = now()
FROM ranked
WHERE i.id = ranked.id AND ranked.rn > 1;

-- 2) Replace the plain index with a partial unique index over live rows.
DROP INDEX IF EXISTS invoices_content_hash_idx;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_rid_content_hash
	ON invoices (restaurant_id, content_hash)
	WHERE content_hash IS NOT NULL AND deleted_at IS NULL;
