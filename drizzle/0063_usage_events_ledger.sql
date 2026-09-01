-- Migration 0063: make monthly_usage auditable, and reset it onto the meter
-- customers are actually shown (ADR-036 —
-- docs/06_decisions/billing/ADR-036-one-metered-unit.md).
--
-- Until now `monthly_usage.used` was a bare counter incremented by
-- claimMonthlyExtraction and decremented by a blind `used - 1`. Nothing
-- recorded *why* it held the value it held, a double release silently
-- under-counted, and the number the app displayed came from a different
-- source entirely (a COUNT over `invoices`). `usage_events` is the
-- append-only trail the counter is now a materialised sum of: for any tenant
-- and month, SUM(delta) equals monthly_usage.used.
--
-- Idempotency is a per-item balance, not a unique key. An item's balance is 0
-- (owes nothing) or 1 (holds a slot); claim requires 0, release requires 1,
-- and llm-quota.ts takes a transaction-scoped advisory lock on the item id
-- while it reads and writes that pair. A unique (batch_item_id, kind) index
-- was the first design and is wrong: an item that failed, was refunded and is
-- then retried has to be able to claim a second time, and the index would
-- have handed it a free extraction instead.
--
-- batch_item_id is nullable and deliberately NOT a foreign key: the ledger has
-- to outlive the item it describes (the batch `remove` action hard-deletes
-- rows), a composite reservation is made before its children exist, and the
-- backfill row below belongs to no item at all.
--
-- Also adds batch_items.extract_error_vars, so a failed item can carry the
-- numbers its message needs — `extract.err.quotaCompositeExceeded` has to say
-- "contiene 17 documentos y te quedan 8", which a translation key alone
-- cannot, and encoding counts into the key would put data in an i18n
-- identifier.

CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"month" text NOT NULL,
	"batch_item_id" uuid,
	"kind" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_month_format" CHECK ("usage_events"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "usage_events_kind_valid" CHECK ("usage_events"."kind" in ('claim', 'release'))
);
--> statement-breakpoint
ALTER TABLE "batch_items" ADD COLUMN "extract_error_vars" jsonb;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_item_idx" ON "usage_events" USING btree ("batch_item_id") WHERE "usage_events"."batch_item_id" is not null;--> statement-breakpoint
CREATE INDEX "usage_events_restaurant_month_idx" ON "usage_events" USING btree ("restaurant_id","month");--> statement-breakpoint

-- Tenant isolation, same mechanism and same caveats as 0055/0057.
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "usage_events"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint

-- Reset the current month onto the new meter.
--
-- `used` has been drifting upward for as long as it has existed: an extraction
-- that completed and was then discarded kept its slot, because no cancel path
-- ever called releaseMonthlyExtraction. Tenants were never shown that number —
-- the sidebar counted saved invoices — so shipping the true value would make
-- counters jump and could push someone over their limit mid-month for
-- consumption they were never told about. The historic drift is forgiven in
-- the customer's favour; metering is exact from the next extraction onward.
UPDATE "monthly_usage" mu
SET "used" = COALESCE((
	SELECT COUNT(*)
	FROM "invoices" i
	WHERE i."restaurant_id" = mu."restaurant_id"
	  AND i."deleted_at" IS NULL
	  AND TO_CHAR(i."created_at", 'YYYY-MM') = mu."month"
), 0)
WHERE mu."month" = TO_CHAR(NOW(), 'YYYY-MM');
--> statement-breakpoint

-- Seed the ledger so SUM(delta) = used holds for every tenant from the first
-- read, including the ones whose counter was just reset. One item-less 'claim'
-- row carrying the whole opening balance.
--
-- Unlimited (business) tenants have no monthly_usage row at all to seed: the
-- old claim returned before writing one whenever the plan limit was null.
-- They open at zero and are metered from here, which is only ever an
-- informational number for them.
INSERT INTO "usage_events" ("restaurant_id", "month", "batch_item_id", "kind", "delta", "reason")
SELECT mu."restaurant_id", mu."month", NULL, 'claim', mu."used", 'backfill:0063'
FROM "monthly_usage" mu
WHERE mu."month" = TO_CHAR(NOW(), 'YYYY-MM')
  AND mu."used" > 0;
