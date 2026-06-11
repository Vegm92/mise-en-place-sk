-- Content hash for 100%-exact invoice deduplication at save time.
-- A SHA-256 of (supplier, invoice number, dates, total, all line items)
-- is stored on every invoice so a byte-for-byte duplicate can be rejected
-- even when the invoice number field is blank.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS content_hash text;
CREATE INDEX IF NOT EXISTS invoices_content_hash_idx
    ON invoices (restaurant_id, content_hash) WHERE content_hash IS NOT NULL;
