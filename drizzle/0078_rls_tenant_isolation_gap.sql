-- Migration 0078: close the RLS gap on the four tenant tables that
-- drizzle/0055_rls_tenant_isolation.sql (and its two follow-ups, 0057 and
-- 0063) never covered (issue #994, ADR-030 —
-- docs/06_decisions/tenancy/ADR-030-rls-runtime-role.md).
--
-- `extraction_results` (0061), `supplier_aliases` (pre-existing) and
-- `categories` (pre-existing) were already listed in
-- `src/lib/server/tenant-data-map.ts` — the #390 authoritative tenant table
-- list 0055's own header cites as its source — but were added to that list
-- (or to schema.ts) after 0055/0057/0063 shipped, so no RLS migration ever
-- followed. All three carry a NOT NULL `restaurant_id` FK to `restaurants`
-- with no global/tenant-less rows, so the ordinary tenant_isolation policy
-- from 0055 applies unchanged.
--
-- `user_restaurants` is different: it was never in tenant-data-map.ts at
-- all, despite being the table that resolves which tenant a request may
-- read (`src/lib/server/locations.ts` joins it to `restaurants` to answer
-- exactly that). It has no `id` column of its own — its primary key is the
-- (user_id, restaurant_id) pair — but `restaurant_id` is NOT NULL and FKs to
-- `restaurants` with ON DELETE CASCADE, so it scopes the same way every
-- other table here does. This migration adds it alongside the other three;
-- `src/lib/server/tenant-data-map.ts` gains a matching entry in the same
-- change so the two stay in lockstep going forward.
--
-- Same mechanism as 0055/0057/0063 throughout: ENABLE (not FORCE) ROW LEVEL
-- SECURITY, keyed on the app.restaurant_id / app.admin session GUCs
-- `src/lib/server/tenant-context.ts` sets per request/job. Inert for the
-- table-owning role every environment still connects as until #464's
-- pending production cutover; takes effect only for the scoped
-- `mep_runtime` role.

ALTER TABLE "extraction_results" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "extraction_results"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "supplier_aliases" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "supplier_aliases"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "categories"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "user_restaurants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "user_restaurants"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
