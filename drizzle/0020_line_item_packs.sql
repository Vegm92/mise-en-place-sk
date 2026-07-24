-- Migration 0020: pack structure on invoice line items (issue #299, Phase 3)
--
-- The deterministic pack parser (src/lib/server/pack-parser.ts) fills these
-- from the line description/unit at save time. All nullable — populated only
-- when a size could be determined; historical rows stay NULL and consumers
-- fall back to the raw unit_price.
--
--   normalized_unit_price = unit_price / (units_per_pack * unit_size, in base_unit)
--   base_unit ∈ {kg, L, ud}
--
-- This is what lets "caja 5kg @ 12,50" and "caja 10kg @ 24,00" compare as
-- €/kg (2,50 vs 2,40) instead of firing a false 92% price-shock.

ALTER TABLE invoice_line_items
    ADD COLUMN IF NOT EXISTS units_per_pack        real,
    ADD COLUMN IF NOT EXISTS unit_size             real,
    ADD COLUMN IF NOT EXISTS size_unit             text,
    ADD COLUMN IF NOT EXISTS base_unit             text,
    ADD COLUMN IF NOT EXISTS normalized_unit_price real;
