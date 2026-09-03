/**
 * Issue #385 — supplier contact fields (CIF/NIF, address, email, phone)
 * extracted from an invoice were captured but never made it onto the
 * created/updated supplier record.
 *
 * Issue #905 — the name guard added for #385 also dropped the contact
 * fields when the reviewer merely corrected the printed name. The guard
 * now only protects supplier rows that already exist: a row created by
 * this save is the document's issuer, whatever name it was given.
 *
 * Issue #918 — the receiver's own phone is a mirror signal for
 * `restaurants.phone`: fills it only while blank, raises a notification
 * instead of overwriting a value the owner already set. Sharing this
 * file's `rid`/`form`/`batchItem`/db-suite setup rather than a second
 * DB-backed test file with its own copy of the same boilerplate.
 *
 * DB-backed; skipped without a local Postgres (see tests/helpers/test-db.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';
import { minimalInvoiceForm as form, minimalBatchItem } from './helpers/invoice-save-form';

let rid = '';

const batchItem = (extractedData: Record<string, unknown> | null) => minimalBatchItem(rid, extractedData);

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

	it('keeps the document contact fields when the reviewed name corrects the printed one (issue #905)', async () => {
		// The document prints a trade name; the reviewer replaces it with the
		// legal name. No supplier by that name exists yet, so the row created
		// here IS the document's issuer and must keep its printed NIF —
		// otherwise the CIF is never captured for exactly the entities whose
		// names vary between documents.
		const legalName = '__sup_contact_legal_name__';
		const item = batchItem({
			supplier_name: '__sup_contact_trade_name__',
			invoice_number: 'INV-RENAMED',
			total_amount: 100,
			confidence: 0.95,
			supplier_nif: '47306879L',
			supplier_address: 'Calle Mayor 1, 07001 Palma',
			supplier_email: 'admin@legalname.es',
			supplier_phone: '+34 971 00 11 22',
			line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
		});

		const out = await saveReviewedInvoice(item, form(legalName, 'INV-RENAMED'), rid);
		expect(out.type).toBe('saved');

		const row = await supplierRow(legalName);
		expect(row).toBeDefined();
		expect(row!.cif).toBe('47306879L');
		expect(row!.address).toBe('Calle Mayor 1, 07001 Palma');
		expect(row!.contact_email).toBe('admin@legalname.es');
		expect(row!.contact_phone).toBe('+34 971 00 11 22');
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

async function restaurantPhone(): Promise<string | null> {
	const rows = await testSql`SELECT phone FROM restaurants WHERE id = ${rid}`;
	return (rows[0]?.phone as string | undefined) ?? null;
}

async function phoneMismatchNotifications(): Promise<Array<Record<string, unknown>>> {
	return testSql`SELECT * FROM system_notifications WHERE restaurant_id = ${rid} AND notification_type = 'restaurant_phone_mismatch'` as unknown as Promise<Array<Record<string, unknown>>>;
}

async function saveWithReceiverPhone(supplier: string, invoiceNumber: string, receiverPhone: string | null) {
	const item = batchItem({
		supplier_name: supplier,
		invoice_number: invoiceNumber,
		total_amount: 100,
		confidence: 0.95,
		receiver_phone: receiverPhone,
		line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
	});
	return saveReviewedInvoice(item, form(supplier, invoiceNumber), rid);
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → restaurant phone signal (issue #918)', () => {
	it('fills a blank restaurants.phone from the first confirmed invoice', async () => {
		const out = await saveWithReceiverPhone('__rphone_fill__', 'RPH-0001', '+34 971 00 11 22');
		expect(out.type).toBe('saved');
		expect(await restaurantPhone()).toBe('+34 971 00 11 22');
	});

	it('never overwrites a phone already on file, and raises a mismatch notification instead', async () => {
		const before = await restaurantPhone();
		expect(before).toBe('+34 971 00 11 22');

		const out = await saveWithReceiverPhone('__rphone_mismatch__', 'RPH-0002', '+34 600 11 22 33');
		expect(out.type).toBe('saved');
		expect(await restaurantPhone()).toBe(before);

		const notifications = await phoneMismatchNotifications();
		expect(notifications.length).toBeGreaterThan(0);
		const payload = notifications[notifications.length - 1].payload as { current?: string; extracted?: string };
		expect(payload.current).toBe('+34 971 00 11 22');
		expect(payload.extracted).toBe('+34 600 11 22 33');
	});

	it('does not raise a notification when the extracted phone matches the one on file', async () => {
		const before = await phoneMismatchNotifications();
		const out = await saveWithReceiverPhone('__rphone_match__', 'RPH-0003', '971001122');
		expect(out.type).toBe('saved');
		expect((await phoneMismatchNotifications()).length).toBe(before.length);
	});

	it('does nothing when the document prints no receiver phone', async () => {
		const before = await restaurantPhone();
		const out = await saveWithReceiverPhone('__rphone_absent__', 'RPH-0004', null);
		expect(out.type).toBe('saved');
		expect(await restaurantPhone()).toBe(before);
	});
});

async function taxIdMismatchNotifications(): Promise<Array<Record<string, unknown>>> {
	return testSql`SELECT * FROM system_notifications WHERE restaurant_id = ${rid} AND notification_type = 'restaurant_tax_id_mismatch'` as unknown as Promise<Array<Record<string, unknown>>>;
}

async function saveWithReceiverNif(supplier: string, invoiceNumber: string, receiverNif: string | null, confidence?: number) {
	const item = batchItem({
		supplier_name: supplier,
		invoice_number: invoiceNumber,
		total_amount: 100,
		confidence: 0.95,
		receiver_nif: receiverNif,
		field_confidences: confidence === undefined ? undefined : { receiver_nif: confidence },
		line_items: [{ description: 'Aceite de oliva', quantity: 1, unit: 'garrafa', unit_price: 100, total_price: 100 }],
	});
	return saveReviewedInvoice(item, form(supplier, invoiceNumber), rid);
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → receiver tax id check (issue #905 task 3)', () => {
	beforeAll(async () => {
		if (!hasDbEnv) return;
		await testSql`UPDATE restaurants SET cif_nif = 'B99999997' WHERE id = ${rid}`;
	});

	it('saves the document anyway and warns when it is addressed to another tax id', async () => {
		const out = await saveWithReceiverNif('__rnif_mismatch__', 'RNIF-0001', '47306879-L');
		expect(out.type).toBe('saved');

		const notifications = await taxIdMismatchNotifications();
		expect(notifications).toHaveLength(1);
		const payload = notifications[0].payload as { current?: string; extracted?: string };
		expect(payload.current).toBe('B99999997');
		expect(payload.extracted).toBe('47306879L');
	});

	it('stays quiet when the receiver tax id is ours, whatever separators it prints', async () => {
		const before = await taxIdMismatchNotifications();
		const out = await saveWithReceiverNif('__rnif_ours__', 'RNIF-0002', 'ES B-99.999.997');
		expect(out.type).toBe('saved');
		expect(await taxIdMismatchNotifications()).toHaveLength(before.length);
	});

	it('stays quiet on a tax id that fails the checksum or reads badly', async () => {
		const before = await taxIdMismatchNotifications();
		expect((await saveWithReceiverNif('__rnif_junk__', 'RNIF-0003', 'B99999998')).type).toBe('saved');
		expect((await saveWithReceiverNif('__rnif_blurry__', 'RNIF-0004', '47306879L', 0.4)).type).toBe('saved');
		expect((await saveWithReceiverNif('__rnif_absent__', 'RNIF-0005', null)).type).toBe('saved');
		expect(await taxIdMismatchNotifications()).toHaveLength(before.length);
	});
});
