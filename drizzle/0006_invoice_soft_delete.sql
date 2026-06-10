-- Add soft-delete support to invoices and an immutable audit log

ALTER TABLE invoices ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_invoices_deleted_at ON invoices(restaurant_id) WHERE deleted_at IS NULL;

CREATE TABLE invoice_audit_log (
  id            SERIAL PRIMARY KEY,
  restaurant_id UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  invoice_id    INTEGER     NOT NULL,
  action        TEXT        NOT NULL, -- 'soft_delete' | 'restore' | 'hard_delete'
  user_id       TEXT        NOT NULL,
  reason        TEXT,
  snapshot      TEXT,                 -- JSON snapshot of invoice fields at action time
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_audit_restaurant ON invoice_audit_log(restaurant_id);
CREATE INDEX idx_invoice_audit_invoice    ON invoice_audit_log(invoice_id);
