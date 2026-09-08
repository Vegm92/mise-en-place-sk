/**
 * End-to-end wiring test for issue #384: saveReviewedInvoice must apply the
 * category extraction proposes to a brand-new supplier, keep falling back to
 * the uncategorised bucket when there is genuinely no signal, and never
 * overwrite a category a human already set on an existing supplier.
 *
 * DB-backed; the db singleton is swapped for the test client (ssl:'require'
 * in db.ts does not speak to local Postgres). Skipped without DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testDb, testSql, hasDbEnv } from './helpers/test-db';
import { useTestRestaurant } from './helpers/test-restaurant';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';
import { UNCATEGORIZED_CATEGORY } from '../src/lib/constants';
import { createCategory, listCategories, setCategoryHidden } from '../src/lib/server/categories';
import { extractedItem, lineItemInvoiceForm } from './helpers/invoice-save-form';

const restaurant = useTestRestaurant('inv-cat-384');
const UID = randomUUID();

function form(supplier: string, lines: Array<{ desc: string; unit: string; price: string }> = []): FormData {
	return lineItemInvoiceForm(supplier, lines);
}

function proposedItem(supplierName: string, category: string, confidence = 0.9) {
	return extractedItem({
		supplier_name: supplierName,
		supplier_category: category,
		field_confidences: { supplier_category: confidence },
		confidence,
	});
}

/** Saves a reviewed invoice and returns the resulting supplier category, asserting the save itself succeeded. */
async function savedCategoryFor(
	item: Parameters<typeof saveReviewedInvoice>[0],
	supplierName: string,
	lines: Array<{ desc: string; unit: string; price: string }>,
): Promise<string | null> {
	const out = await saveReviewedInvoice(item, form(supplierName, lines), restaurant.id, UID);
	expect(out.type).toBe('saved');
	if (out.type !== 'saved') return null;
	return categoryFor(out.invoiceId);
}

async function categoryFor(invoiceId: number): Promise<string | null> {
	const rows = await testSql`
		SELECT s.category FROM suppliers s
		JOIN invoices i ON i.supplier_id = s.id
		WHERE i.id = ${invoiceId}`;
	return rows[0]?.category ?? null;
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → supplier category (issue #384)', () => {
	it('categorises a brand-new high-signal supplier saved exactly as extracted', async () => {
		const supplierName = 'Suministros Alimentarios Goya, S.L.';
		const item = extractedItem({
			supplier_name: supplierName,
			supplier_category: 'Aceites y Conservas',
			field_confidences: { supplier_category: 0.9 },
			confidence: 0.9,
		});

		const category = await savedCategoryFor(item, supplierName, [
			{ desc: 'Aceite de Oliva Virgen Extra', unit: 'L', price: '10' },
			{ desc: 'Tomate Triturado', unit: 'kg', price: '5' },
		]);
		expect(category).toBe('Aceites y Conservas');
	});

	it('still categorises when the user trivially corrects the supplier name on review (the #384 bug)', async () => {
		// Extraction dropped the legal suffix; the review screen is exactly
		// where a user fixes that — this correction must not be read as "a
		// different supplier" and must not discard the proposed category.
		const extractedName = 'Panificadora Els Encants';
		const correctedName = 'Panificadora Els Encants, S.L.';
		const item = extractedItem({
			supplier_name: extractedName,
			supplier_category: 'Panadería y Bollería',
			field_confidences: { supplier_category: 0.88 },
			confidence: 0.9,
		});

		const category = await savedCategoryFor(item, correctedName, [
			{ desc: 'Barra de Pan', unit: 'ud', price: '1' },
		]);
		expect(category).toBe('Panadería y Bollería');
	});

	it('falls back to the uncategorised bucket when the user renames to a genuinely different supplier', async () => {
		const item = extractedItem({
			supplier_name: 'Lácteos García, S.L.',
			supplier_category: 'Lácteos',
			field_confidences: { supplier_category: 0.9 },
			confidence: 0.9,
		});

		const category = await savedCategoryFor(item, 'García Bebidas, S.L.', [
			{ desc: 'Refresco de Cola', unit: 'ud', price: '1' },
		]);
		expect(category).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('falls back to the uncategorised bucket when the two names differ only by an explicit, different legal form', async () => {
		const item = extractedItem({
			supplier_name: 'Distribuciones Ruiz S.L.',
			supplier_category: 'Bebidas',
			field_confidences: { supplier_category: 0.9 },
			confidence: 0.9,
		});

		const category = await savedCategoryFor(item, 'Distribuciones Ruiz S.A.', [
			{ desc: 'Agua Mineral', unit: 'botella', price: '1' },
		]);
		expect(category).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('falls back to the uncategorised bucket for a genuinely no-signal new supplier', async () => {
		const supplierName = 'Comercial Genérica del Levante S.L.';
		const item = extractedItem({
			supplier_name: supplierName,
			supplier_category: null,
			field_confidences: { supplier_category: 0.2 },
			confidence: 0.9,
		});

		const category = await savedCategoryFor(item, supplierName, [
			{ desc: 'Material de oficina variado', unit: 'ud', price: '1' },
		]);
		expect(category).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('never overwrites an existing supplier category with a later, different guess', async () => {
		const supplierName = 'Bebidas Costa Brava S.L.';
		const first = extractedItem({
			supplier_name: supplierName,
			supplier_category: 'Bebidas',
			field_confidences: { supplier_category: 0.9 },
			confidence: 0.9,
		});
		expect(await savedCategoryFor(first, supplierName, [
			{ desc: 'Agua Mineral', unit: 'botella', price: '1' },
		])).toBe('Bebidas');

		// A human overrides it away from the machine guess.
		await testSql`
			UPDATE suppliers SET category = 'Vinos y Cavas'
			WHERE restaurant_id = ${restaurant.id} AND lower(name) = lower(${supplierName})`;

		// A second invoice arrives with a different, even higher-confidence guess.
		const second = extractedItem({
			supplier_name: supplierName,
			supplier_category: 'Congelados',
			field_confidences: { supplier_category: 0.99 },
			confidence: 0.99,
		});
		expect(await savedCategoryFor(second, supplierName, [
			{ desc: 'Guisantes Congelados', unit: 'kg', price: '3' },
		])).toBe('Vinos y Cavas');
	});

	it('accepts a custom category the restaurant created, when extraction proposes exactly its name (issue #881 part 2)', async () => {
		const supplierName = 'Agencia de Marketing Norte';
		await createCategory(restaurant.id, 'Marketing', testDb);

		const category = await savedCategoryFor(
			proposedItem(supplierName, 'Marketing'), supplierName, [{ desc: 'Campaña redes', unit: 'ud', price: '1' }],
		);
		expect(category).toBe('Marketing');
	});

	it('degrades to the uncategorised bucket when extraction proposes a category this restaurant has hidden (issue #881 part 2)', async () => {
		const supplierName = 'Frutería Escondida';
		const rows = await listCategories(restaurant.id, {}, testDb);
		const fruit = rows.find((c) => c.name === 'Frutas y Verduras')!;
		await setCategoryHidden(restaurant.id, fruit.id, true, testDb);
		try {
			const category = await savedCategoryFor(
				proposedItem(supplierName, 'Frutas y Verduras'), supplierName, [{ desc: 'Tomate pera', unit: 'kg', price: '1' }],
			);
			expect(category).toBe(UNCATEGORIZED_CATEGORY);
		} finally {
			await setCategoryHidden(restaurant.id, fruit.id, false, testDb);
		}
	});
});
