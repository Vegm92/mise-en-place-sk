ALTER TABLE "invoices" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "iban" text;