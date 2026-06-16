-- Migration 0007: e-invoicing extensions (issues #110, #111, #112)
--
-- Adds columns to the invoices table to support:
--   #110  VERI*FACTU / TicketBAI QR code verification
--   #111  Structured XML ingestion (Facturae 3.2.2 / UBL 2.1)
--   #112  Invoice acceptance status workflow per RD 238/2026

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS e_invoice_format text,
  ADD COLUMN IF NOT EXISTS qr_url           text,
  ADD COLUMN IF NOT EXISTS qr_mismatch      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at          timestamptz;

-- Index to find pending e-invoices needing acceptance (the 4-working-day clock)
CREATE INDEX IF NOT EXISTS idx_invoices_rid_einvoice_pending
  ON invoices (restaurant_id, created_at)
  WHERE e_invoice_format IS NOT NULL
    AND status = 'pending'
    AND deleted_at IS NULL;
