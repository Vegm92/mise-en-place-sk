/**
 * Issue #385 — supplier contact fields (CIF/NIF, address, email, phone)
 * extracted from an invoice were captured but never made it onto the
 * created/updated supplier record.
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
	return {
		id: 'test-item',
		batchId: 'test-batch',
		restaurantId: rid,
		position: 0,
		fileKey: 'test.pdf',
		displayName: 'test.pdf',
		status: 'done',
		extractedData,
		conversionNotes: null,
		extractError: null,
	};
}

async function supplierRow(name: string) {
	const rows = await testSql`SELECT * FROM suppliers WHERE restaurant_id = ${rid} AND lower(name) = ${name.toLowerCase()}`;
	return rows[0] as Record<string, unknown> | undefined;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('sup-contact');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → supplier contact fields (issue #385)', () => {
	it('persists CIF/NIF, address, email and phone onto a newly created supplier', async () => {
		const supplierName = '__sup_contact_goya__';
		const item = batchItem({
			supplier_name: supplierName,
			invoice_number: 'SAG-2026-881',
			total_amount: 100,
			confidence: 0.95,
			supplier_nif: 'B-99881122',
			supplier_address: 'Polígono Ind. La Resina, Nave 14, 28201 Madrid',
			supplier_email: 'facturacion@goya.es',
			supplier_phone: '+34 91 555 22 33',
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});

		const out = await saveReviewedInvoice(item, form(supplierName, 'SAG-2026-881'), rid);
		expect(out.type).toBe('saved');

		const row = await supplierRow(supplierName);
		expect(row).toBeDefined();
		expect(row!.cif).toBe('B-99881122');
		expect(row!.address).toBe('Polígono Ind. La Resina, Nave 14, 28201 Madrid');
		expect(row!.contact_email).toBe('facturacion@goya.es');
		expect(row!.contact_phone).toBe('+34 91 555 22 33');
	});

	it('does not fabricate contact fields when the source document has none', async () => {
		const supplierName = '__sup_contact_noinfo__';
		const item = batchItem({
			supplier_name: supplierName,
			invoice_number: 'ALB-0001',
			total_amount: 100,
			confidence: 0.95,
			supplier_nif: null,
			supplier_address: null,
			supplier_email: null,
			supplier_phone: null,
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});

		const out = await saveReviewedInvoice(item, form(supplierName, 'ALB-0001'), rid);
		expect(out.type).toBe('saved');

		const row = await supplierRow(supplierName);
		expect(row).toBeDefined();
		expect(row!.cif).toBeNull();
		expect(row!.address).toBeNull();
		expect(row!.contact_email).toBeNull();
		expect(row!.contact_phone).toBeNull();
	});

	it('fills in missing contact fields on a later invoice without clobbering existing ones', async () => {
		const supplierName = '__sup_contact_fillgap__';

		// First invoice: only CIF is printed.
		const first = batchItem({
			supplier_name: supplierName,
			invoice_number: 'INV-0001',
			total_amount: 100,
			confidence: 0.95,
			supplier_nif: 'B11112222',
			supplier_address: null,
			supplier_email: null,
			supplier_phone: null,
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});
		await saveReviewedInvoice(first, form(supplierName, 'INV-0001'), rid);

		let row = await supplierRow(supplierName);
		expect(row!.cif).toBe('B11112222');
		expect(row!.contact_email).toBeNull();

		// Second invoice for the same supplier: prints an email, and a
		// (wrong) different CIF — the original CIF must win, the email gap
		// must be filled.
		const second = batchItem({
			supplier_name: supplierName,
			invoice_number: 'INV-0002',
			total_amount: 100,
			confidence: 0.95,
			supplier_nif: 'B99999999',
			supplier_address: null,
			supplier_email: 'contacto@fillgap.es',
			supplier_phone: null,
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});
		await saveReviewedInvoice(second, form(supplierName, 'INV-0002'), rid);

		row = await supplierRow(supplierName);
		expect(row!.cif).toBe('B11112222');
		expect(row!.contact_email).toBe('contacto@fillgap.es');
	});

	it('ignores extracted contact fields when the reviewed supplier name was changed to a different supplier', async () => {
		const otherSupplier = '__sup_contact_other__';
		await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, ${otherSupplier})`;

		const item = batchItem({
			supplier_name: '__sup_contact_original__',
			invoice_number: 'INV-RETARGET',
			total_amount: 100,
			confidence: 0.95,
			supplier_nif: 'B00000000',
			supplier_email: 'original@example.es',
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});

		// User retargeted the review form to an existing, different supplier.
		const out = await saveReviewedInvoice(item, form(otherSupplier, 'INV-RETARGET'), rid);
		expect(out.type).toBe('saved');

		const row = await supplierRow(otherSupplier);
		expect(row!.cif).toBeNull();
		expect(row!.contact_email).toBeNull();
	});
});
