ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS supplier_sku text;
ALTER TABLE product_aliases ADD COLUMN IF NOT EXISTS supplier_sku text;
