-- Migration 0081: referential integrity for user_restaurants, and an index on
-- every foreign key that is read or cascaded through (issues #995, #996).
--
-- The FK first: `user_restaurants.user_id` had no reference to `users`, so a
-- membership could outlive the user it belongs to — and `memberLocations()`
-- reads that table to decide which restaurants a caller may see. The account
-- deletion path already removes memberships explicitly
-- (`api/user/delete/+server.ts`), so `ON DELETE cascade` is a backstop, not a
-- behaviour change. The pre-check reports an orphan count and rolls back
-- rather than letting Postgres fail on the constraint, same shape as
-- `0039_invoice_dates_typed.sql`.
--
-- Then the indexes. None of these is urgent at the measured volume (0.247 GB
-- total, Postgres CPU avg 0.014 vCPU of 8) — they are cheap now and awkward
-- under load. Plain `CREATE INDEX`, not `CONCURRENTLY`: drizzle-kit runs each
-- statement inside a transaction, which forbids CONCURRENTLY, and the largest
-- table here is small enough that the write lock is momentary.
DO $$
DECLARE orphan_count bigint;
BEGIN
	SELECT count(*) INTO orphan_count
	FROM "user_restaurants" ur
	WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = ur."user_id");
	IF orphan_count > 0 THEN
		RAISE EXCEPTION 'user_restaurants has % row(s) whose user_id has no users row; delete them before migrating: DELETE FROM user_restaurants ur WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id)', orphan_count;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "user_restaurants" ADD CONSTRAINT "user_restaurants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "batch_items_restaurant_status_idx" ON "batch_items" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "chat_sessions_restaurant_idx" ON "chat_sessions" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "extraction_corrections_restaurant_idx" ON "extraction_corrections" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "extraction_corrections_invoice_idx" ON "extraction_corrections" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "extraction_corrections_supplier_idx" ON "extraction_corrections" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_restaurant_idx" ON "idempotency_keys" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_supplier_id" ON "invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "mrr_snapshots_restaurant_idx" ON "mrr_snapshots" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supplier_metrics_restaurant_idx" ON "supplier_metrics" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "upload_batches_restaurant_idx" ON "upload_batches" USING btree ("restaurant_id","created_at");
