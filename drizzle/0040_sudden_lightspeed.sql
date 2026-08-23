ALTER TABLE "invoice_line_items" ADD COLUMN "supplier_sku" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "outstanding_balance" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_aliases" ADD COLUMN "supplier_sku" text;