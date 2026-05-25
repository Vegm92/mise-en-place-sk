ALTER TABLE `invoices` ADD COLUMN `tax_base` real;--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `tax_breakdown` text;--> statement-breakpoint
ALTER TABLE `invoice_line_items` ADD COLUMN `tax_rate` real;
