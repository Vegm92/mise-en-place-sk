ALTER TABLE invoice_line_items ADD COLUMN supplier_sku text;
ALTER TABLE product_aliases ADD COLUMN supplier_sku text;
ALTER TABLE suppliers ADD COLUMN outstanding_balance numeric(12,2);
