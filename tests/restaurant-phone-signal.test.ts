/**
 * Issue #918 — receiver_phone is a signal for the restaurant's own contact
 * data, but it must never silently clobber a phone the owner set by hand in
 * Settings. saveReviewedInvoice fills restaurants.phone only while it is
 * blank, and otherwise raises a restaurant_phone_mismatch notification so
 * the owner decides whether to update it.
 *
 * DB-backed; skipped without a local Postgres (see tests/helpers/test-db.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import {
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';
import type { BatchItem } from '../src/lib/server/batch';
import { fakeBatchItem } from './helpers/batch-item';

let rid = '';

function form(supplier: string, invoiceNumber: string): FormData {
	const fd = new FormData();
	fd.append('supplier_name', supplier);
	fd.append('invoice_number', invoiceNumber);
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', '100');
	fd.append('low_confidence_ack', 'true');
	fd.append('line_descriptions', 'Aceite de oliva');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'garrafa');
	fd.append('line_unit_prices', '100');
	fd.append('line_total_prices', '100');
	fd.append('line_tax_rates', '');
	return fd;
}

function batchItem(extractedData: Record<string, unknown> | null): BatchItem {
	return fakeBatchItem({
		id: 'test-item',
		batchId: 'test-batch',
		restaurantId: rid,
		fileKey: 'test.pdf',
		displayName: 'test.pdf',
		extractedData,
	});
}

async function restaurantPhone(): Promise<string | null> {
	const rows = await testSql`SELECT phone FROM restaurants WHERE id = ${rid}`;
	return (rows[0]?.phone as string | undefined) ?? null;
}

async function phoneMismatchNotifications(): Promise<Array<Record<string, unknown>>> {
	return testSql`SELECT * FROM system_notifications WHERE restaurant_id = ${rid} AND notification_type = 'restaurant_phone_mismatch'` as unknown as Promise<Array<Record<string, unknown>>>;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('restaurant-phone');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → restaurant phone signal (issue #918)', () => {
	it('fills a blank restaurants.phone from the first confirmed invoice', async () => {
		const supplierName = '__rphone_fill__';
		const item = batchItem({
			supplier_name: supplierName,
			invoice_number: 'RPH-0001',
			total_amount: 100,
			confidence: 0.95,
			receiver_phone: '+34 971 00 11 22',
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});

		const out = await saveReviewedInvoice(item, form(supplierName, 'RPH-0001'), rid);
		expect(out.type).toBe('saved');
		expect(await restaurantPhone()).toBe('+34 971 00 11 22');
	});

	it('never overwrites a phone already on file, and raises a mismatch notification instead', async () => {
		const supplierName = '__rphone_mismatch__';
		const item = batchItem({
			supplier_name: supplierName,
			invoice_number: 'RPH-0002',
			total_amount: 100,
			confidence: 0.95,
			receiver_phone: '+34 600 11 22 33',
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});

		// The phone was filled by the previous test — it now stands in for an owner-confirmed value.
		const before = await restaurantPhone();
		expect(before).toBe('+34 971 00 11 22');

		const out = await saveReviewedInvoice(item, form(supplierName, 'RPH-0002'), rid);
		expect(out.type).toBe('saved');

		expect(await restaurantPhone()).toBe(before);

		const notifications = await phoneMismatchNotifications();
		expect(notifications.length).toBeGreaterThan(0);
		const payload = notifications[notifications.length - 1].payload as { current?: string; extracted?: string };
		expect(payload.current).toBe('+34 971 00 11 22');
		expect(payload.extracted).toBe('+34 600 11 22 33');
	});

	it('does not raise a notification when the extracted phone matches the one on file', async () => {
		const supplierName = '__rphone_match__';
		const item = batchItem({
			supplier_name: supplierName,
			invoice_number: 'RPH-0003',
			total_amount: 100,
			confidence: 0.95,
			receiver_phone: '971001122',
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});

		const before = await phoneMismatchNotifications();
		const out = await saveReviewedInvoice(item, form(supplierName, 'RPH-0003'), rid);
		expect(out.type).toBe('saved');

		const after = await phoneMismatchNotifications();
		expect(after.length).toBe(before.length);
	});

	it('does nothing when the document prints no receiver phone', async () => {
		const supplierName = '__rphone_absent__';
		const item = batchItem({
			supplier_name: supplierName,
			invoice_number: 'RPH-0004',
			total_amount: 100,
			confidence: 0.95,
			receiver_phone: null,
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});

		const before = await restaurantPhone();
		const out = await saveReviewedInvoice(item, form(supplierName, 'RPH-0004'), rid);
		expect(out.type).toBe('saved');
		expect(await restaurantPhone()).toBe(before);
	});
});
