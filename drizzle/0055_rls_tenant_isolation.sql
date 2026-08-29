-- Migration 0055: database-enforced tenant isolation via Postgres Row-Level
-- Security (issue #222, ADR-030 — docs/06_decisions/tenancy/ADR-030-rls-runtime-role.md).
--
-- ENABLE (not FORCE) ROW LEVEL SECURITY on every tenant-owned table listed in
-- src/lib/server/tenant-data-map.ts (the #390 authoritative tenant table
-- list). Table owners always bypass RLS regardless of ENABLE/FORCE, so this
-- migration is inert for the owner/superuser role that DATABASE_MIGRATION_URL,
-- every local dev database, CI, and — until #464's pending production step
-- completes — DATABASE_URL itself all use today. It only takes effect for the
-- scoped `mep_runtime` role created by scripts/create-runtime-role.sql (#464),
-- which owns none of these tables. FORCE is deliberately not used: it would
-- also bind the table-owning role, breaking every owner-role migration,
-- backfill, and the current production connection the moment this migration
-- ran — see ADR-030 for the full ENABLE-vs-FORCE analysis.
--
-- Every policy is keyed on two session GUCs the application sets per
-- request/job — never ported from the dead auth.uid() policies dropped in
-- ADR-005 (drizzle/0001_rls_policies.sql):
--   app.restaurant_id — the active tenant, set via a reserved connection's
--     session state for the lifetime of one request or one worker job
--     (src/lib/server/tenant-context.ts, runWithTenantContext).
--   app.admin — 'true' only on explicit system/cross-tenant code paths
--     (admin UI, scheduled dispatchers, webhook ingestion, new-tenant
--     bootstrap transactions) — never set as a blanket fallback for a
--     missing app.restaurant_id.
-- A connection with neither GUC set — current_setting(..., true) returning
-- NULL — matches neither branch of every USING/WITH CHECK clause below and
-- therefore sees zero rows: the intended backstop for a forgotten
-- forTenant() scope once the runtime role is live in production.
--
-- `restaurants` is the one root/self-referencing table in the map: its own
-- `id` plays the role every other table's `restaurant_id` column plays
-- elsewhere. Every table's WITH CHECK mirrors its USING clause, restaurants
-- included: creating a brand-new tenant row therefore needs app.admin (the
-- onboarding and add-location transactions set it with SET LOCAL for exactly
-- this reason — see ADR-030). A plain WITH CHECK(true) here would look
-- permissive-only-for-INSERT but is not: Postgres evaluates the same
-- USING/WITH CHECK pair for every command on an ALL-scoped policy, so a
-- freshly inserted row's own INSERT ... RETURNING still has to pass USING to
-- be handed back — an unconditional WITH CHECK would have let the INSERT
-- through and then failed confusingly on the read-back instead.

ALTER TABLE "restaurants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "restaurants"
	USING (
		"id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "suppliers"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "invoices"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "invoice_line_items"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "category_budgets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "category_budgets"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "unit_conversions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "unit_conversions"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "chat_sessions"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "chat_messages"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "extraction_corrections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "extraction_corrections"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "stock_levels" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_levels"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "settings"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "products"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "system_notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "system_notifications"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "invoice_audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "invoice_audit_log"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "product_aliases" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "product_aliases"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "supplier_metrics" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "supplier_metrics"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "llm_usage_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "llm_usage_log"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "tenant_llm_quotas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_llm_quotas"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "monthly_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "monthly_usage"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "idempotency_keys"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "upload_batches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "upload_batches"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "batch_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "batch_items"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_contacts"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "whatsapp_pairing_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "whatsapp_pairing_codes"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "subscriptions"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "mrr_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "mrr_snapshots"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "dead_letter_queue"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
--> statement-breakpoint
ALTER TABLE "digest_shares" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "digest_shares"
	USING (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	)
	WITH CHECK (
		"restaurant_id"::text = current_setting('app.restaurant_id', true)
		OR current_setting('app.admin', true) = 'true'
	);
