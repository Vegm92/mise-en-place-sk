/**
 * DB-backed tests for surfacing unit-conversion prompts in the Products
 * "sugerencias pendientes" tab (issue #582).
 *
 * Covers which pending alerts become prompts, that defining a conversion from
 * the suggestions tab persists a tenant-scoped `unit_conversions` row (and
 * clears the alert + the line-item flag), and that the stored rule is actually
 * consulted the next time line items are annotated.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import {
	loadConversionPrompts, defineUnitConversion, annotateLineItems,
} from '../src/lib/server/products';
import { locale, t, translations } from '../src/lib/i18n';

let ridA = '';
let ridB = '';
let supplierA = 0;
let supplierB = 0;
const SUPPLIER_A_NAME = '__conv_supplier_a__';
const SUPPLIER_B_NAME = '__conv_supplier_b__';
let supplierMixed = 0;
const SUPPLIER_MIXED_NAME = '__Conv Distribuciones Pérez__';

beforeAll(async () => {
	if (!hasDbEnv) return;
	const a = await createTestRestaurant('convprompt-a');
	const b = await createTestRestaurant('convprompt-b');
	ridA = a.id;
	ridB = b.id;
	const [sa] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${ridA}, ${SUPPLIER_A_NAME}) RETURNING id`;
	const [sb] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${ridB}, ${SUPPLIER_B_NAME}) RETURNING id`;
	const [sm] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${ridA}, ${SUPPLIER_MIXED_NAME}) RETURNING id`;
	supplierA = sa.id;
	supplierB = sb.id;
	supplierMixed = sm.id;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	for (const rid of [ridA, ridB]) {
		await testSql`DELETE FROM system_notifications WHERE restaurant_id = ${rid}`;
		await testSql`DELETE FROM unit_conversions WHERE restaurant_id = ${rid}`;
		await testSql`DELETE FROM invoice_line_items WHERE restaurant_id = ${rid}`;
		await testSql`DELETE FROM invoices WHERE restaurant_id = ${rid}`;
	}
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(ridA);
	await cleanupTestRestaurant(ridB);
	await closeDb();
});

async function raiseAlert(
	rid: string,
	supplierId: number | null,
	supplierName: string,
	ingredient: string,
	purchaseUnit: string,
	quantity: number | null = 2,
	status = 'pending',
) {
	const payload = JSON.stringify({
		supplierId, supplierName, ingredient, purchaseUnit, quantity,
		messageKey: 'notif.msg.unitConversion',
		messageVars: { ingredient, quantity: quantity ?? '?', unit: purchaseUnit },
	});
	const [row] = await testSql`
		INSERT INTO system_notifications (restaurant_id, notification_type, message, payload, status)
		VALUES (${rid}, 'unit_conversion_needed', ${`unit_conversion_needed: ${ingredient}`}, ${payload}, ${status})
		RETURNING id
	`;
	return row.id as number;
}

async function raiseLine(rid: string, supplierId: number, description: string, unit: string) {
	const [inv] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id) VALUES (${rid}, ${supplierId}) RETURNING id
	`;
	const [line] = await testSql`
		INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, unit, quantity, unit_price, requires_unit_conversion)
		VALUES (${rid}, ${inv.id}, ${description}, ${unit}, 2, 30, 1)
		RETURNING id
	`;
	return line.id as number;
}

describe.skipIf(!hasDbEnv)('loadConversionPrompts — which suggestion rows need a conversion', () => {
	it('returns one prompt per pending unit_conversion_needed alert with supplier + ingredient + purchase unit', async () => {
		const notifId = await raiseAlert(ridA, supplierA, SUPPLIER_A_NAME, 'Aceite de Oliva', 'garrafa', 3);

		const prompts = await loadConversionPrompts(testDb, ridA);

		expect(prompts).toEqual([{
			notificationId: notifId,
			supplierId: supplierA,
			supplierName: SUPPLIER_A_NAME,
			ingredient: 'Aceite de Oliva',
			purchaseUnit: 'garrafa',
			quantity: 3,
		}]);
	});

	it('ignores product_suggestion alerts and already-resolved conversion alerts', async () => {
		await testSql`
			INSERT INTO system_notifications (restaurant_id, notification_type, message, payload, status)
			VALUES (${ridA}, 'product_suggestion', 'product_suggestion: Tomate ~ Tomate Pera',
			        ${JSON.stringify({ description: 'Tomate', candidateName: 'Tomate Pera', score: 0.9 })}, 'pending')
		`;
		await raiseAlert(ridA, supplierA, SUPPLIER_A_NAME, 'Sal Marina', 'saco', 1, 'sent');

		expect(await loadConversionPrompts(testDb, ridA)).toEqual([]);
	});

	it('collapses repeated alerts for the same supplier + ingredient + unit into one prompt', async () => {
		await raiseAlert(ridA, supplierA, SUPPLIER_A_NAME, 'Harina', 'saco', 1);
		const newest = await raiseAlert(ridA, supplierA, SUPPLIER_A_NAME, 'HARINA', 'Saco', 4);

		const prompts = await loadConversionPrompts(testDb, ridA);

		expect(prompts).toHaveLength(1);
		expect(prompts[0].notificationId).toBe(newest);
		expect(prompts[0].quantity).toBe(4);
	});

	it('drops prompts whose conversion rule is already defined', async () => {
		await raiseAlert(ridA, supplierA, SUPPLIER_A_NAME, 'Tomate Pera', 'caja', 2);
		await raiseAlert(ridA, supplierA, SUPPLIER_A_NAME, 'Pimiento', 'caja', 2);
		await testSql`
			INSERT INTO unit_conversions (restaurant_id, supplier_id, supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor)
			VALUES (${ridA}, ${supplierA}, ${SUPPLIER_A_NAME}, 'tomate pera', 'CAJA', 'kg', 10)
		`;

		const prompts = await loadConversionPrompts(testDb, ridA);

		expect(prompts.map((p) => p.ingredient)).toEqual(['Pimiento']);
	});

	it('never returns another tenant\'s prompts', async () => {
		await raiseAlert(ridB, supplierB, SUPPLIER_B_NAME, 'Merluza', 'caja', 1);

		expect(await loadConversionPrompts(testDb, ridA)).toEqual([]);
		expect((await loadConversionPrompts(testDb, ridB)).map((p) => p.ingredient)).toEqual(['Merluza']);
	});

	it('skips alerts whose payload carries no ingredient or purchase unit', async () => {
		await testSql`
			INSERT INTO system_notifications (restaurant_id, notification_type, message, payload, status)
			VALUES (${ridA}, 'unit_conversion_needed', 'legacy alert', NULL, 'pending')
		`;
		await raiseAlert(ridA, supplierA, SUPPLIER_A_NAME, '', 'caja', 1);

		expect(await loadConversionPrompts(testDb, ridA)).toEqual([]);
	});
});

describe.skipIf(!hasDbEnv)('defineUnitConversion — setting a conversion from the suggestions tab', () => {
	it('persists a tenant-scoped unit_conversions row and resolves the pending alert', async () => {
		const notifId = await raiseAlert(ridA, supplierA, SUPPLIER_A_NAME, 'Aceite de Oliva', 'garrafa', 3);

		const result = await defineUnitConversion(testDb, ridA, {
			supplierId: supplierA,
			supplierName: SUPPLIER_A_NAME,
			ingredient: 'Aceite de Oliva',
			purchaseUnit: 'garrafa',
			canonicalUnit: 'L',
			conversionFactor: 5,
		});

		expect(result).toEqual({ ok: true, resolvedPrompts: 1 });

		const rows = await testSql`
			SELECT restaurant_id, supplier_id, supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor
			FROM unit_conversions WHERE restaurant_id = ${ridA}
		`;
		expect(rows).toHaveLength(1);
		expect(rows[0].restaurant_id).toBe(ridA);
		expect(rows[0].supplier_id).toBe(supplierA);
		expect(rows[0].ingredient).toBe('Aceite de Oliva');
		expect(rows[0].purchase_unit).toBe('garrafa');
		expect(rows[0].canonical_unit).toBe('L');
		expect(rows[0].conversion_factor).toBe(5);

		const [after] = await testSql`SELECT status FROM system_notifications WHERE id = ${notifId}`;
		expect(after.status).toBe('sent');

		expect(await loadConversionPrompts(testDb, ridA)).toEqual([]);
	});

	it('clears requires_unit_conversion on this tenant\'s matching line items only', async () => {
		const lineA = await raiseLine(ridA, supplierA, 'Aceite de Oliva', 'garrafa');
		const lineB = await raiseLine(ridB, supplierB, 'Aceite de Oliva', 'garrafa');

		await defineUnitConversion(testDb, ridA, {
			supplierId: supplierA,
			supplierName: SUPPLIER_A_NAME,
			ingredient: 'Aceite de Oliva',
			purchaseUnit: 'garrafa',
			canonicalUnit: 'L',
			conversionFactor: 5,
		});

		const [rowA] = await testSql`SELECT requires_unit_conversion, canonical_unit FROM invoice_line_items WHERE id = ${lineA}`;
		expect(rowA.requires_unit_conversion).toBe(0);
		expect(rowA.canonical_unit).toBe('L');

		const [rowB] = await testSql`SELECT requires_unit_conversion FROM invoice_line_items WHERE id = ${lineB}`;
		expect(rowB.requires_unit_conversion).toBe(1);

		const otherTenantRules = await testSql`SELECT id FROM unit_conversions WHERE restaurant_id = ${ridB}`;
		expect(otherTenantRules).toHaveLength(0);
	});

	it('rejects an incomplete or non-positive rule and writes nothing', async () => {
		expect(await defineUnitConversion(testDb, ridA, {
			supplierId: supplierA, supplierName: SUPPLIER_A_NAME, ingredient: '  ',
			purchaseUnit: 'garrafa', canonicalUnit: 'L', conversionFactor: 5,
		})).toEqual({ ok: false, reason: 'invalid' });

		expect(await defineUnitConversion(testDb, ridA, {
			supplierId: supplierA, supplierName: SUPPLIER_A_NAME, ingredient: 'Aceite',
			purchaseUnit: 'garrafa', canonicalUnit: 'L', conversionFactor: 0,
		})).toEqual({ ok: false, reason: 'invalid' });

		expect(await testSql`SELECT id FROM unit_conversions WHERE restaurant_id = ${ridA}`).toHaveLength(0);
	});

	it('updates the factor in place when the same rule is defined twice', async () => {
		await defineUnitConversion(testDb, ridA, {
			supplierId: supplierA, supplierName: SUPPLIER_A_NAME, ingredient: 'Harina',
			purchaseUnit: 'saco', canonicalUnit: 'kg', conversionFactor: 20,
		});
		await defineUnitConversion(testDb, ridA, {
			supplierId: supplierA, supplierName: SUPPLIER_A_NAME, ingredient: 'Harina',
			purchaseUnit: 'saco', canonicalUnit: 'kg', conversionFactor: 25,
		});

		const rows = await testSql`SELECT conversion_factor FROM unit_conversions WHERE restaurant_id = ${ridA}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].conversion_factor).toBe(25);
	});
});

describe.skipIf(!hasDbEnv)('future extractions consult the unit_conversions table', () => {
	it('annotates a later line with the rule defined from the suggestions tab', async () => {
		const before = await annotateLineItems(SUPPLIER_A_NAME, [
			{ description: 'Aceite de Oliva', quantity: 2, unit: 'garrafa 5L', unitPrice: 30, totalPrice: 60 },
		], ridA, supplierA, testDb);
		expect(before.enriched[0].requiresUnitConversion).toBe(true);

		await defineUnitConversion(testDb, ridA, {
			supplierId: supplierA, supplierName: SUPPLIER_A_NAME, ingredient: 'Aceite de Oliva',
			purchaseUnit: 'garrafa 5L', canonicalUnit: 'L', conversionFactor: 5,
		});

		const after = await annotateLineItems(SUPPLIER_A_NAME, [
			{ description: 'ACEITE  DE OLIVA', quantity: 2, unit: 'GARRAFA 5L', unitPrice: 30, totalPrice: 60 },
		], ridA, supplierA, testDb);

		expect(after.conversionNotes).toEqual([]);
		expect(after.enriched[0].requiresUnitConversion).toBe(false);
		expect(after.enriched[0].canonicalUnit).toBe('L');
		expect(after.enriched[0].convertedQuantity).toBe(10);
		expect(after.enriched[0].convertedUnitPrice).toBe(6);
	});

	it('finds the rule when the extraction knows only the supplier name, whatever its casing', async () => {
		await defineUnitConversion(testDb, ridA, {
			supplierId: supplierMixed, supplierName: SUPPLIER_MIXED_NAME, ingredient: 'Merluza',
			purchaseUnit: 'caja 6 kg', canonicalUnit: 'kg', conversionFactor: 6,
		});

		const asWorkerSeesIt = await annotateLineItems('  __CONV DISTRIBUCIONES PEREZ__  ', [
			{ description: 'Merluza', quantity: 3, unit: 'CAJA 6 KG', unitPrice: 60, totalPrice: 180 },
		], ridA, null, testDb);

		expect(asWorkerSeesIt.conversionNotes).toEqual([]);
		expect(asWorkerSeesIt.enriched[0].requiresUnitConversion).toBe(false);
		expect(asWorkerSeesIt.enriched[0].canonicalUnit).toBe('kg');
		expect(asWorkerSeesIt.enriched[0].convertedQuantity).toBe(18);
	});

	it('does not let one tenant\'s rule answer another tenant\'s extraction', async () => {
		await defineUnitConversion(testDb, ridA, {
			supplierId: supplierA, supplierName: SUPPLIER_A_NAME, ingredient: 'Aceite de Oliva',
			purchaseUnit: 'garrafa 5L', canonicalUnit: 'L', conversionFactor: 5,
		});

		const other = await annotateLineItems(SUPPLIER_B_NAME, [
			{ description: 'Aceite de Oliva', quantity: 2, unit: 'garrafa 5L', unitPrice: 30, totalPrice: 60 },
		], ridB, supplierB, testDb);

		expect(other.enriched[0].requiresUnitConversion).toBe(true);
	});
});

describe('products suggestions tab wiring (issue #582)', () => {
	const pageServer = readFileSync('src/routes/(app)/products/+page.server.ts', 'utf-8');
	const page = readFileSync('src/routes/(app)/products/+page.svelte', 'utf-8');
	const api = readFileSync('src/routes/(app)/api/unit-conversions/+server.ts', 'utf-8');

	it('the products load feeds conversion prompts to the page', () => {
		expect(pageServer).toMatch(/loadConversionPrompts/);
		expect(pageServer).toMatch(/conversionPrompts/);
	});

	it('the suggestions tab renders the conversion prompts', () => {
		const suggestionsBlock = page.slice(page.indexOf("tab === 'catalog'"));
		expect(suggestionsBlock).toMatch(/conversionPrompts/);
		expect(page).toMatch(/prod\.conv\.save/);
	});

	it('the suggestions tab defines the conversion through the existing conversions API', () => {
		expect(page).toMatch(/\/api\/unit-conversions/);
	});

	it('the conversions API reuses the shared defineUnitConversion helper instead of duplicating it', () => {
		expect(api).toMatch(/defineUnitConversion/);
	});
});

describe('i18n keys for the suggestions-tab conversion prompt', () => {
	const keys = ['prod.conv.heading', 'prod.conv.ask', 'prod.conv.save', 'prod.conv.error', 'prod.conv.badge'];

	it('every new key exists in both locales', () => {
		for (const key of keys) {
			expect(Object.keys(translations.es)).toContain(key);
			expect(Object.keys(translations.en)).toContain(key);
		}
	});

	it('resolves in Spanish and English', () => {
		for (const lc of ['es', 'en'] as const) {
			locale.set(lc);
			for (const key of keys) expect(get(t)(key)).not.toBe(key);
		}
		locale.set('es');
	});
});
