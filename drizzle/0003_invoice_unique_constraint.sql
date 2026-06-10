-- De-duplicate before adding constraint: keep the highest-id row for each (restaurant_id, supplier_id, invoice_number)
DELETE FROM invoices
WHERE invoice_number IS NOT NULL
  AND id NOT IN (
    SELECT MAX(id)
    FROM invoices
    WHERE invoice_number IS NOT NULL
    GROUP BY restaurant_id, supplier_id, invoice_number
  );

-- Partial unique index prevents duplicate (restaurant, supplier, invoice_number) pairs
-- NULL invoice_number is excluded (unnumbered invoices are allowed to coexist)
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_rid_supplier_number
  ON invoices (restaurant_id, supplier_id, invoice_number)
  WHERE invoice_number IS NOT NULL;
