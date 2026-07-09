-- Migration 0014: one supplier name per tenant, case-insensitive (issue #238)
--
-- suppliers had no unique index on (restaurant_id, name), and three call sites
-- did select-then-insert. Concurrent saves of a new supplier created duplicate
-- rows; because uq_invoices_rid_supplier_number is keyed on supplier_id, the
-- clones also silently defeated invoice-number dedup. Merge existing duplicates,
-- then add the index. The app upserts via ON CONFLICT (restaurant_id, lower(name)).

-- 1) Merge duplicate-name suppliers (case-insensitive) within each tenant.
--    Canonical = lowest id. Repoint child rows, then drop the losers.
CREATE TEMP TABLE supplier_merge_map ON COMMIT DROP AS
SELECT s.id AS dup_id,
       first_value(s.id) OVER (
           PARTITION BY s.restaurant_id, lower(s.name)
           ORDER BY s.id
       ) AS canonical_id
FROM suppliers s;

UPDATE invoices i
SET supplier_id = m.canonical_id
FROM supplier_merge_map m
WHERE i.supplier_id = m.dup_id AND m.dup_id <> m.canonical_id;

UPDATE extraction_corrections e
SET supplier_id = m.canonical_id
FROM supplier_merge_map m
WHERE e.supplier_id = m.dup_id AND m.dup_id <> m.canonical_id;

UPDATE unit_conversions u
SET supplier_id = m.canonical_id
FROM supplier_merge_map m
WHERE u.supplier_id = m.dup_id AND m.dup_id <> m.canonical_id;

-- supplier_metrics has UNIQUE(supplier_id); a loser's derived row would collide
-- with the canonical's on repoint. Drop the losers' rows — they are recomputed
-- on the next metrics run.
DELETE FROM supplier_metrics sm
USING supplier_merge_map m
WHERE sm.supplier_id = m.dup_id AND m.dup_id <> m.canonical_id;

DELETE FROM suppliers s
USING supplier_merge_map m
WHERE s.id = m.dup_id AND m.dup_id <> m.canonical_id;

-- 2) Enforce one supplier name per tenant, case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_rid_name
	ON suppliers (restaurant_id, lower(name));
