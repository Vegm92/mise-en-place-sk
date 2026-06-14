-- Migration: add supplier_id FK to unit_conversions (issue #158)
-- Adds a nullable FK to suppliers so conversion rules survive supplier renames.
-- supplier_name is kept for rules authored before the supplier record exists.

ALTER TABLE unit_conversions
    ADD COLUMN IF NOT EXISTS supplier_id integer REFERENCES suppliers(id) ON DELETE SET NULL;

-- Backfill: link existing rules to supplier records where name matches (case-insensitive).
UPDATE unit_conversions uc
SET supplier_id = s.id
FROM suppliers s
WHERE s.restaurant_id = uc.restaurant_id
  AND LOWER(TRIM(s.name)) = LOWER(TRIM(uc.supplier_name))
  AND uc.supplier_id IS NULL;

CREATE INDEX IF NOT EXISTS unit_conversions_supplier_id_idx
    ON unit_conversions(restaurant_id, supplier_id, ingredient, purchase_unit)
    WHERE supplier_id IS NOT NULL;
