-- Migration: composite indexes on hot query paths (issue #107)
-- Postgres does not auto-index FK columns; with RLS adding restaurant_id
-- predicates to every query these indexes are needed sooner than usual.

-- invoices: list/filter by status and chronological sort
CREATE INDEX IF NOT EXISTS idx_invoices_rid_status
    ON invoices (restaurant_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_rid_created_at
    ON invoices (restaurant_id, created_at);

-- invoice_line_items: fetch all items for an invoice + price-history search
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
    ON invoice_line_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_rid_description
    ON invoice_line_items (restaurant_id, description);

-- system_notifications: unread-badge and notification list queries
CREATE INDEX IF NOT EXISTS idx_system_notifications_rid_status_created
    ON system_notifications (restaurant_id, status, created_at);
