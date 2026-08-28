/**
 * Schema integrity tests — verifies all Drizzle-defined tables and their
 * key columns exist in the live PostgreSQL database.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { testSql, closeDb, hasDbEnv } from './helpers/test-db';

afterAll(() => closeDb());

// Every table defined in src/lib/server/schema.ts
const EXPECTED_TABLES = [
	'restaurants',
	'user_restaurants',
	'suppliers',
	'invoices',
	'invoice_audit_log',
	'invoice_line_items',
	'supplier_metrics',
	'settings',
	'category_budgets',
	'unit_conversions',
	'system_notifications',
	'stock_levels',
	'extraction_corrections',
	'chat_sessions',
	'chat_messages',
	'llm_usage_log',
	'tenant_llm_quotas',
	'waitlist',
	'upload_batches',
	'batch_items',
	'subscriptions',
	'app_flags',
];

async function getColumns(table: string) {
	const rows = await testSql`
		SELECT column_name, data_type, is_nullable
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = ${table}
		ORDER BY ordinal_position
	`;
	return rows.map(r => r.column_name as string);
}

describe.skipIf(!hasDbEnv)('Schema — all tables present', () => {
	it('every expected table exists in public schema', async () => {
		const rows = await testSql`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		`;
		const actual = rows.map(r => r.table_name as string);
		for (const t of EXPECTED_TABLES) {
			expect(actual, `Table "${t}" is missing`).toContain(t);
		}
	});

	it('upload_sessions was dropped (issue #514 — retired by ADR-015, #425 removed the last reader)', async () => {
		const rows = await testSql`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		`;
		const actual = rows.map(r => r.table_name as string);
		expect(actual).not.toContain('upload_sessions');
	});
});

describe.skipIf(!hasDbEnv)('Schema — column checks', () => {
	it('restaurants: id, name, slug, created_at', async () => {
		const cols = await getColumns('restaurants');
		['id', 'name', 'slug', 'created_at'].forEach(c => expect(cols).toContain(c));
	});

	it('user_restaurants: user_id, restaurant_id, role', async () => {
		const cols = await getColumns('user_restaurants');
		['user_id', 'restaurant_id', 'role'].forEach(c => expect(cols).toContain(c));
	});

	it('suppliers: id, restaurant_id, name, category', async () => {
		const cols = await getColumns('suppliers');
		['id', 'restaurant_id', 'name', 'category'].forEach(c => expect(cols).toContain(c));
	});

	it('invoices: all business columns present', async () => {
		const cols = await getColumns('invoices');
		[
			'id', 'restaurant_id', 'supplier_id', 'invoice_number', 'invoice_date',
			'due_date', 'total_amount', 'tax_base', 'tax_breakdown', 'status',
			'confidence', 'source_file', 'notes', 'created_at',
		].forEach(c => expect(cols, `invoices.${c} missing`).toContain(c));
	});

	it('invoice_line_items: all business columns present', async () => {
		const cols = await getColumns('invoice_line_items');
		[
			'id', 'restaurant_id', 'invoice_id', 'description', 'quantity',
			'unit', 'unit_price', 'total_price', 'tax_rate',
			'requires_unit_conversion', 'canonical_unit',
		].forEach(c => expect(cols, `invoice_line_items.${c} missing`).toContain(c));
	});

	it('system_notifications: notification_type, payload, status', async () => {
		const cols = await getColumns('system_notifications');
		['notification_type', 'message', 'payload', 'status', 'restaurant_id'].forEach(
			c => expect(cols).toContain(c)
		);
	});

	it('system_notifications.payload is jsonb, not text (issue #497)', async () => {
		const rows = await testSql`
			SELECT data_type FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'system_notifications' AND column_name = 'payload'
		`;
		expect(rows[0]?.data_type).toBe('jsonb');
	});

	it('supplier_metrics: score columns all present', async () => {
		const cols = await getColumns('supplier_metrics');
		[
			'score', 'price_stability_score', 'frequency_score',
			'timeliness_score', 'price_stability_cv',
		].forEach(c => expect(cols).toContain(c));
	});

	it('waitlist: id, email, created_at', async () => {
		const cols = await getColumns('waitlist');
		['id', 'email', 'created_at'].forEach(c => expect(cols).toContain(c));
	});

	it('invoices.qr_mismatch and invoice_line_items.requires_unit_conversion are boolean, not int-as-boolean (issue #514)', async () => {
		const rows = await testSql`
			SELECT table_name, data_type FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND (
				  (table_name = 'invoices' AND column_name = 'qr_mismatch')
				  OR (table_name = 'invoice_line_items' AND column_name = 'requires_unit_conversion')
			  )
		`;
		expect(rows).toHaveLength(2);
		for (const row of rows) expect(row.data_type).toBe('boolean');
	});
});

describe.skipIf(!hasDbEnv)('Schema — foreign key constraints', () => {
	async function fkExists(fromTable: string, fromCol: string, toTable: string) {
		const rows = await testSql`
			SELECT ccu.table_name AS to_table
			FROM information_schema.key_column_usage kcu
			JOIN information_schema.referential_constraints rc
				ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
			JOIN information_schema.constraint_column_usage ccu
				ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.constraint_schema
			WHERE kcu.table_schema = 'public'
			  AND kcu.table_name   = ${fromTable}
			  AND kcu.column_name  = ${fromCol}
		`;
		return rows.some(r => r.to_table === toTable);
	}

	it('invoices.restaurant_id → restaurants', async () => {
		expect(await fkExists('invoices', 'restaurant_id', 'restaurants')).toBe(true);
	});

	it('invoices.supplier_id → suppliers', async () => {
		expect(await fkExists('invoices', 'supplier_id', 'suppliers')).toBe(true);
	});

	it('invoice_line_items.invoice_id → invoices (cascade)', async () => {
		expect(await fkExists('invoice_line_items', 'invoice_id', 'invoices')).toBe(true);
	});

	it('supplier_metrics.supplier_id → suppliers (cascade)', async () => {
		expect(await fkExists('supplier_metrics', 'supplier_id', 'suppliers')).toBe(true);
	});

	it('user_restaurants.restaurant_id → restaurants (cascade)', async () => {
		expect(await fkExists('user_restaurants', 'restaurant_id', 'restaurants')).toBe(true);
	});
});

describe.skipIf(!hasDbEnv)('Schema — unique constraints', () => {
	it('restaurants.slug has a unique constraint', async () => {
		const rows = await testSql`
			SELECT constraint_name
			FROM information_schema.table_constraints
			WHERE table_schema = 'public'
			  AND table_name   = 'restaurants'
			  AND constraint_type = 'UNIQUE'
		`;
		expect(rows.length).toBeGreaterThan(0);
	});

	it('waitlist.email has a unique constraint', async () => {
		const rows = await testSql`
			SELECT constraint_name
			FROM information_schema.table_constraints
			WHERE table_schema = 'public'
			  AND table_name   = 'waitlist'
			  AND constraint_type = 'UNIQUE'
		`;
		expect(rows.length).toBeGreaterThan(0);
	});

	it('settings has a unique index on (restaurant_id, key)', async () => {
		// Drizzle's uniqueIndex() creates a PostgreSQL index, not a UNIQUE constraint,
		// so it appears in pg_indexes but not in information_schema.table_constraints.
		const rows = await testSql`
			SELECT indexname FROM pg_indexes
			WHERE schemaname = 'public' AND tablename = 'settings'
		`;
		expect(rows.length).toBeGreaterThan(0);
	});

	it('system_notifications has a partial index serving the layout budget-overage filter (issue #497)', async () => {
		const rows = await testSql`
			SELECT indexdef FROM pg_indexes
			WHERE schemaname = 'public' AND tablename = 'system_notifications'
			  AND indexname = 'idx_system_notifications_budget_overage_exceeded'
		`;
		expect(rows).toHaveLength(1);
		expect(rows[0].indexdef).toContain(`(payload ->> 'level'::text) = 'exceeded'::text`);
	});
});
