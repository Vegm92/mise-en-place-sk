UPDATE "invoices" SET "invoice_date" = NULL WHERE btrim("invoice_date") = '';--> statement-breakpoint
UPDATE "invoices" SET "due_date" = NULL WHERE btrim("due_date") = '';--> statement-breakpoint
DO $$
DECLARE bad_count bigint;
BEGIN
	SELECT count(*) INTO bad_count FROM "invoices"
	WHERE ("invoice_date" IS NOT NULL AND "invoice_date" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
	   OR ("due_date"     IS NOT NULL AND "due_date"     !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
	IF bad_count > 0 THEN
		RAISE EXCEPTION 'invoices has % row(s) with a non-ISO invoice_date/due_date; repair them before migrating (see drizzle/0038_invoice_dates_typed.audit.sql)', bad_count;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "invoice_date" SET DATA TYPE date USING "invoice_date"::date;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DATA TYPE date USING "due_date"::date;--> statement-breakpoint
ALTER TABLE "category_budgets" ADD CONSTRAINT "category_budgets_month_format" CHECK ("category_budgets"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "acquisition_costs" ADD CONSTRAINT "acquisition_costs_month_format" CHECK ("acquisition_costs"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "monthly_usage" ADD CONSTRAINT "monthly_usage_month_format" CHECK ("monthly_usage"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "mrr_snapshots" ADD CONSTRAINT "mrr_snapshots_month_format" CHECK ("mrr_snapshots"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
