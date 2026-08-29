-- Migration 0057: extend database-enforced tenant isolation (issue #222,
-- ADR-030 — docs/06_decisions/tenancy/ADR-030-rls-runtime-role.md) to the two
-- tables 0056 added for recipe costing (escandallos): `recipes` and
-- `recipe_items`. Same mechanism as drizzle/0055_rls_tenant_isolation.sql —
-- ENABLE (not FORCE) ROW LEVEL SECURITY, keyed on the same two session GUCs
-- (app.restaurant_id / app.admin) the application already sets per
-- request/job via src/lib/server/tenant-context.ts. Inert for the
-- table-owning role every environment still connects as until #464's
-- pending production cutover; takes effect only for the scoped
-- `mep_runtime` role. See ADR-030 for the full ENABLE-vs-FORCE analysis —
-- unchanged here, just applied to two more tables added after that ADR
-- shipped.

ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "recipes"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "recipe_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "recipe_items"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
