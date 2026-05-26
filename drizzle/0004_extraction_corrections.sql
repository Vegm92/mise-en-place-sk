CREATE TABLE `extraction_corrections` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `invoice_id` integer REFERENCES `invoices`(`id`),
  `supplier_id` integer REFERENCES `suppliers`(`id`),
  `field_name` text NOT NULL,
  `original_value` text,
  `corrected_value` text,
  `line_item_index` integer,
  `corrected_at` text DEFAULT CURRENT_TIMESTAMP
);
