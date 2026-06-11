-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  Row Level Security policies for Mise en Place                             ║
-- ║                                                                            ║
-- ║  Access model: users reach data through the restaurants they belong to    ║
-- ║  (user_restaurants pivot). Every business table is scoped by restaurant_id ║
-- ║  via the reusable sub-select:                                              ║
-- ║                                                                            ║
-- ║    restaurant_id IN (SELECT restaurant_id FROM user_restaurants            ║
-- ║                      WHERE user_id = auth.uid()::text)                     ║
-- ║                                                                            ║
-- ║  user_id is stored as text; auth.uid() is cast to text for comparisons.   ║
-- ║  RLS protects the Supabase Data API path; the app's own request path uses  ║
-- ║  a direct (owner) Postgres connection that bypasses RLS and relies on      ║
-- ║  explicit WHERE restaurant_id = locals.restaurantId scoping.               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Idempotent helper: drop-then-create so this file can be re-applied cleanly.

-- ── user_restaurants ───────────────────────────────────────────────────────
ALTER TABLE user_restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_associations" ON user_restaurants;
CREATE POLICY "users_own_associations" ON user_restaurants
	FOR ALL
	USING (user_id = auth.uid()::text)
	WITH CHECK (user_id = auth.uid()::text);

-- ── restaurants ────────────────────────────────────────────────────────────
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_access_their_restaurants" ON restaurants;
CREATE POLICY "users_access_their_restaurants" ON restaurants
	FOR SELECT
	USING (id IN (SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text));
DROP POLICY IF EXISTS "users_update_their_restaurants" ON restaurants;
CREATE POLICY "users_update_their_restaurants" ON restaurants
	FOR UPDATE
	USING (id IN (
		SELECT restaurant_id FROM user_restaurants
		WHERE user_id = auth.uid()::text AND role = 'owner'
	));
-- INSERT/DELETE on restaurants is service-role only (no anon/user policy).

-- ── Restaurant-scoped tables (uniform FOR ALL policy) ──────────────────────
-- suppliers, invoices, invoice_line_items, invoice_audit_log, supplier_metrics,
-- settings, category_budgets, unit_conversions, system_notifications,
-- stock_levels, extraction_corrections, chat_sessions, chat_messages.

DO $$
DECLARE
	tbl text;
	tables text[] := ARRAY[
		'suppliers', 'invoices', 'invoice_line_items', 'invoice_audit_log',
		'supplier_metrics', 'settings', 'category_budgets', 'unit_conversions',
		'system_notifications', 'stock_levels', 'extraction_corrections',
		'chat_sessions', 'chat_messages'
	];
BEGIN
	FOREACH tbl IN ARRAY tables LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
		EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'restaurant_members_access_' || tbl, tbl);
		EXECUTE format($f$
			CREATE POLICY %I ON %I
				FOR ALL
				USING (restaurant_id IN (
					SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text))
				WITH CHECK (restaurant_id IN (
					SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text));
		$f$, 'restaurant_members_access_' || tbl, tbl);
	END LOOP;
END $$;

-- ── waitlist ───────────────────────────────────────────────────────────────
-- Public signup: anyone may INSERT their email; no end-user SELECT/UPDATE/DELETE
-- (only service_role reads the list).
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_can_join_waitlist" ON waitlist;
CREATE POLICY "anyone_can_join_waitlist" ON waitlist
	FOR INSERT
	WITH CHECK (true);

-- Note: subscriptions, llm_usage_log, tenant_llm_quotas, upload_sessions are
-- written only by the server (service role / direct connection) and are not
-- exposed to end-users via the Data API, so they intentionally have no
-- user-facing RLS policies.
