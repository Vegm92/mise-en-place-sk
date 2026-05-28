-- Phase 2: Add supplier contact/identity fields
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cif text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS delivery_days text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms text;
