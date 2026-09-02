ALTER TABLE "invoices" ADD COLUMN "gross_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "retention_rate" real;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "retention_amount" numeric(12, 2);