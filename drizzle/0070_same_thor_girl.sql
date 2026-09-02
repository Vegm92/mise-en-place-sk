ALTER TABLE "invoices" ADD COLUMN "purchase_order" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "seller_name" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "delivery_date" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "printed_notes" text;--> statement-breakpoint
CREATE INDEX "idx_invoices_rid_purchase_order" ON "invoices" USING btree ("restaurant_id","purchase_order") WHERE "invoices"."purchase_order" IS NOT NULL;