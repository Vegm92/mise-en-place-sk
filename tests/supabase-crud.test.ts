/**
 * CRUD + multi-tenancy isolation tests.
 *
 * Creates two isolated test restaurants, inserts business data into each,
 * and verifies that queries scoped to one restaurant never surface data
 * from the other. Cleans up all test data in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import {
	restaurants, suppliers, invoices, invoiceLineItems,
	categoryBudgets, systemNotifications, settings, waitlist,
} from '../src/lib/server/schema';

let rid1 = '', rid2 = '';
let suppId1 = 0, invId1 = 0;

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r1 = await createTestRestaurant('alpha');
	const r2 = await createTestRestaurant('beta');
	rid1 = r1.id;
	rid2 = r2.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid1);
	await cleanupTestRestaurant(rid2);
	await closeDb();
});

// ── Restaurants ───────────────────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('restaurants — basic CRUD', () => {
	it('both test restaurants exist', async () => {
		const rows = await testDb.select().from(restaurants)
			.where(eq(restaurants.id, rid1));
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toContain('Test Restaurant');
	});

	it('slug is unique — inserting a duplicate slug fails', async () => {
		const [r] = await testSql`SELECT slug FROM restaurants WHERE id = ${rid1}`;
		await expect(
			testSql`INSERT INTO restaurants (name, slug) VALUES ('dup', ${r.slug})`
		).rejects.toThrow();
	});
});

// ── Suppliers ─────────────────────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('suppliers — insert and scope', () => {
	it('inserts a supplier for restaurant 1', async () => {
		const [row] = await testDb.insert(suppliers).values({
			restaurantId: rid1,
			name:     'Proveedor Test Alpha',
			category: 'Carnes y Derivados',
		}).returning();
		suppId1 = row.id;
		expect(suppId1).toBeGreaterThan(0);
	});

	it('inserts a supplier for restaurant 2', async () => {
		const [row] = await testDb.insert(suppliers).values({
			restaurantId: rid2,
			name:     'Proveedor Test Beta',
			category: 'Pescados y Mariscos',
		}).returning();
		expect(row.id).toBeGreaterThan(0);
	});

	it('scoped query for rid1 returns only rid1 supplier', async () => {
		const rows = await testDb.select().from(suppliers)
			.where(eq(suppliers.restaurantId, rid1));
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe('Proveedor Test Alpha');
	});

	it('scoped query for rid2 does not leak rid1 data', async () => {
		const rows = await testDb.select().from(suppliers)
			.where(eq(suppliers.restaurantId, rid2));
		const names = rows.map(r => r.name);
		expect(names).not.toContain('Proveedor Test Alpha');
		expect(names).toContain('Proveedor Test Beta');
	});
});

// ── Invoices + Line Items ─────────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('invoices + line items — CRUD and scoping', () => {
	it('inserts an invoice for restaurant 1', async () => {
		const [row] = await testDb.insert(invoices).values({
			restaurantId:  rid1,
			supplierId:    suppId1,
			invoiceNumber: 'TEST-INV-001',
			invoiceDate:   '2025-01-15',
			totalAmount:   1500.00,
			taxBase:       1239.67,
			taxBreakdown:  JSON.stringify([{ rate: 0.21, base: 1239.67, cuota: 260.33 }]),
			status:        'approved',
			confidence:    0.95,
		}).returning();
		invId1 = row.id;
		expect(invId1).toBeGreaterThan(0);
	});

	it('inserts line items for the invoice', async () => {
		await testDb.insert(invoiceLineItems).values([
			{
				restaurantId: rid1,
				invoiceId:    invId1,
				description:  'Lomo de ternera 1kg',
				quantity:     5,
				unit:         'kg',
				unitPrice:    18.50,
				totalPrice:   92.50,
				taxRate:      0.10,
			},
			{
				restaurantId: rid1,
				invoiceId:    invId1,
				description:  'Entrecot 500g',
				quantity:     10,
				unit:         'ud',
				unitPrice:    12.00,
				totalPrice:   120.00,
				taxRate:      0.10,
			},
		]);
		const rows = await testDb.select().from(invoiceLineItems)
			.where(eq(invoiceLineItems.invoiceId, invId1));
		expect(rows).toHaveLength(2);
	});

	it('status update persists correctly', async () => {
		await testDb.update(invoices).set({ status: 'paid' })
			.where(and(eq(invoices.id, invId1), eq(invoices.restaurantId, rid1)));
		const [row] = await testDb.select({ status: invoices.status })
			.from(invoices).where(eq(invoices.id, invId1));
		expect(row.status).toBe('paid');
	});

	it('invoice query scoped to rid2 does not return rid1 invoice', async () => {
		const rows = await testDb.select().from(invoices)
			.where(eq(invoices.restaurantId, rid2));
		const ids = rows.map(r => r.id);
		expect(ids).not.toContain(invId1);
	});

	it('cascade delete: removing invoice deletes its line items', async () => {
		await testDb.delete(invoices).where(eq(invoices.id, invId1));
		const rows = await testDb.select().from(invoiceLineItems)
			.where(eq(invoiceLineItems.invoiceId, invId1));
		expect(rows).toHaveLength(0);
	});
});

// ── Category Budgets ──────────────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('category_budgets — upsert', () => {
	it('inserts a budget for rid1', async () => {
		await testDb.insert(categoryBudgets).values({
			restaurantId:  rid1,
			category:      'Carnes y Derivados',
			month:         '2026-01',
			monthlyBudget: 3000,
		});
		const [row] = await testDb.select().from(categoryBudgets)
			.where(and(
				eq(categoryBudgets.restaurantId, rid1),
				eq(categoryBudgets.category, 'Carnes y Derivados'),
			));
		expect(row.monthlyBudget).toBe(3000);
	});

	it('upsert updates the budget without inserting a duplicate', async () => {
		await testSql`
			INSERT INTO category_budgets (restaurant_id, category, month, monthly_budget)
			VALUES (${rid1}, 'Carnes y Derivados', '2026-01', 3500)
			ON CONFLICT (restaurant_id, category, month) DO UPDATE SET monthly_budget = EXCLUDED.monthly_budget
		`;
		const rows = await testDb.select().from(categoryBudgets)
			.where(and(
				eq(categoryBudgets.restaurantId, rid1),
				eq(categoryBudgets.category, 'Carnes y Derivados'),
			));
		expect(rows).toHaveLength(1);
		expect(rows[0].monthlyBudget).toBe(3500);
	});

	it('rid2 has no budgets from rid1', async () => {
		const rows = await testDb.select().from(categoryBudgets)
			.where(eq(categoryBudgets.restaurantId, rid2));
		expect(rows).toHaveLength(0);
	});
});

// ── Settings ──────────────────────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('settings — key-value store', () => {
	it('inserts and reads a setting', async () => {
		await testDb.insert(settings).values({
			restaurantId: rid1,
			key:   'has_completed_onboarding',
			value: 'false',
		});
		const [row] = await testDb.select().from(settings)
			.where(and(eq(settings.restaurantId, rid1), eq(settings.key, 'has_completed_onboarding')));
		expect(row.value).toBe('false');
	});

	it('unique constraint prevents duplicate key per restaurant', async () => {
		await expect(
			testDb.insert(settings).values({ restaurantId: rid1, key: 'has_completed_onboarding', value: 'true' })
		).rejects.toThrow();
	});
});

// ── System Notifications ──────────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('system_notifications — scoping', () => {
	it('inserts and reads a notification scoped to rid1', async () => {
		await testDb.insert(systemNotifications).values({
			restaurantId:     rid1,
			notificationType: 'price_shock',
			message:          'Test price shock alert',
			payload:          JSON.stringify({ ingredient: 'ternera', pct: 18 }),
			status:           'pending',
		});
		const rows = await testDb.select().from(systemNotifications)
			.where(and(
				eq(systemNotifications.restaurantId, rid1),
				eq(systemNotifications.notificationType, 'price_shock'),
			));
		expect(rows).toHaveLength(1);
		expect(JSON.parse(rows[0].payload!).pct).toBe(18);
	});

	it('rid2 cannot see rid1 notifications', async () => {
		const rows = await testDb.select().from(systemNotifications)
			.where(eq(systemNotifications.restaurantId, rid2));
		expect(rows).toHaveLength(0);
	});
});

// ── Waitlist ──────────────────────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('waitlist — upsert semantics', () => {
	const testEmail = `test-vitest-${Date.now()}@test.example`;

	afterAll(async () => {
		await testSql`DELETE FROM waitlist WHERE email = ${testEmail}`;
	});

	it('inserts a new email and returns it', async () => {
		const result = await testDb.insert(waitlist).values({ email: testEmail })
			.onConflictDoNothing().returning({ id: waitlist.id });
		expect(result.length).toBe(1);
	});

	it('duplicate email is silently ignored (onConflictDoNothing)', async () => {
		const result = await testDb.insert(waitlist).values({ email: testEmail })
			.onConflictDoNothing().returning({ id: waitlist.id });
		expect(result.length).toBe(0);
	});
});

// ── Cascade delete — restaurant ───────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('cascade delete — restaurant removal', () => {
	it('deleting restaurant 1 cascades to all its tables', async () => {
		// Insert fresh supplier + budget before the cascade test
		const [s] = await testDb.insert(suppliers).values({
			restaurantId: rid1,
			name:         'Supplier for cascade test',
		}).returning();

		await testDb.insert(categoryBudgets).values({
			restaurantId: rid1, category: 'Bebidas', month: '2026-01', monthlyBudget: 500,
		}).onConflictDoNothing();

		// Delete restaurant — should cascade
		await cleanupTestRestaurant(rid1);
		rid1 = ''; // mark as cleaned

		// Verify no orphaned rows remain
		const suppRows = await testSql`SELECT id FROM suppliers WHERE id = ${s.id}`;
		expect(suppRows).toHaveLength(0);
	});
});
