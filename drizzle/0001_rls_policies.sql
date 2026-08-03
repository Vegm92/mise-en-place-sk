-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  Row Level Security — removed for the Railway Postgres migration           ║
-- ║                                                                            ║
-- ║  These policies used to key every check off auth.uid(), a function that    ║
-- ║  only exists because of Supabase's Data API/GoTrue integration. The app's  ║
-- ║  own SSR request path never went through that Data API — it always used a ║
-- ║  direct (owner) Postgres connection that bypasses RLS entirely and relies  ║
-- ║  on explicit WHERE restaurant_id = locals.restaurantId scoping in code     ║
-- ║  (see tests/tenant-isolation.test.ts). On Railway Postgres there is no     ║
-- ║  Data API and no auth.uid(), so these policies would fail to even create.  ║
-- ║  Dropped rather than ported — app-layer scoping is the real enforcement.   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
	tbl text;
	tables text[] := ARRAY[
		'user_restaurants', 'restaurants', 'suppliers', 'invoices',
		'invoice_line_items', 'invoice_audit_log', 'supplier_metrics', 'settings',
		'category_budgets', 'unit_conversions', 'system_notifications',
		'stock_levels', 'extraction_corrections', 'chat_sessions', 'chat_messages',
		'waitlist'
	];
BEGIN
	FOREACH tbl IN ARRAY tables LOOP
		EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', tbl);
	END LOOP;
END $$;

DROP POLICY IF EXISTS "users_own_associations" ON user_restaurants;
DROP POLICY IF EXISTS "users_access_their_restaurants" ON restaurants;
DROP POLICY IF EXISTS "users_update_their_restaurants" ON restaurants;
DROP POLICY IF EXISTS "restaurant_members_access_suppliers" ON suppliers;
DROP POLICY IF EXISTS "restaurant_members_access_invoices" ON invoices;
DROP POLICY IF EXISTS "restaurant_members_access_invoice_line_items" ON invoice_line_items;
DROP POLICY IF EXISTS "restaurant_members_access_invoice_audit_log" ON invoice_audit_log;
DROP POLICY IF EXISTS "restaurant_members_access_supplier_metrics" ON supplier_metrics;
DROP POLICY IF EXISTS "restaurant_members_access_settings" ON settings;
DROP POLICY IF EXISTS "restaurant_members_access_category_budgets" ON category_budgets;
DROP POLICY IF EXISTS "restaurant_members_access_unit_conversions" ON unit_conversions;
DROP POLICY IF EXISTS "restaurant_members_access_system_notifications" ON system_notifications;
DROP POLICY IF EXISTS "restaurant_members_access_stock_levels" ON stock_levels;
DROP POLICY IF EXISTS "restaurant_members_access_extraction_corrections" ON extraction_corrections;
DROP POLICY IF EXISTS "restaurant_members_access_chat_sessions" ON chat_sessions;
DROP POLICY IF EXISTS "restaurant_members_access_chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "anyone_can_join_waitlist" ON waitlist;
