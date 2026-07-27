/**
 * Guard for the LLM-proposed supplier category (issue #315).
 *
 * Extraction may propose a category for a supplier nobody has classified yet.
 * The model is asked for one exact string from VALID_CATEGORIES, but a model
 * will happily return a translation, an invented category, or a lower-cased
 * unaccented variant. `resolveSupplierCategory` is the only door into
 * `suppliers.category` for machine-proposed values: it maps a recognisable
 * variant back onto its canonical string and turns everything else into the
 * uncategorised bucket, so a bad guess degrades into "Other" + the existing
 * categorisation nudge instead of poisoning the taxonomy.
 *
 * Pure assertions — no DB, no network.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	VALID_CATEGORIES,
	UNCATEGORIZED_CATEGORY,
	MIN_CATEGORY_CONFIDENCE,
	resolveSupplierCategory,
} from '../src/lib/constants';
import { getOrCreateSupplierId } from '../src/lib/server/supplier';
import { suppliers } from '../src/lib/server/schema';
import {
	testDb,
	createTestRestaurant,
	cleanupTestRestaurant,
	closeDb,
	hasDbEnv,
} from './helpers/test-db';

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

describe('resolveSupplierCategory', () => {
	it('accepts every canonical category unchanged', () => {
		for (const cat of VALID_CATEGORIES) {
			expect(resolveSupplierCategory(cat)).toBe(cat);
		}
	});

	it('maps case and whitespace variants back onto the canonical string', () => {
		expect(resolveSupplierCategory('  lácteos  ')).toBe('Lácteos');
		expect(resolveSupplierCategory('BEBIDAS')).toBe('Bebidas');
		expect(resolveSupplierCategory('vinos y cavas')).toBe('Vinos y Cavas');
	});

	it('maps unaccented variants back onto the canonical string', () => {
		// Models routinely drop diacritics; that is a spelling slip, not a
		// different category.
		expect(resolveSupplierCategory('Lacteos')).toBe('Lácteos');
		expect(resolveSupplierCategory('Panaderia y Bolleria')).toBe('Panadería y Bollería');
		expect(resolveSupplierCategory('Especias y Condimentos')).toBe('Especias y Condimentos');
	});

	it('falls back to the uncategorised bucket for invented categories', () => {
		expect(resolveSupplierCategory('Ferretería')).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveSupplierCategory('Material de Oficina')).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('falls back for translations of a real category', () => {
		// "Dairy" is Lácteos, but accepting it would mean accepting arbitrary
		// model output; the nudge is the safety net.
		expect(resolveSupplierCategory('Dairy')).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveSupplierCategory('Beverages')).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('falls back for missing, empty and non-string input', () => {
		expect(resolveSupplierCategory(null)).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveSupplierCategory(undefined)).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveSupplierCategory('')).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveSupplierCategory('   ')).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveSupplierCategory(42)).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveSupplierCategory({ category: 'Bebidas' })).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('never returns a value outside the canonical taxonomy', () => {
		const canonical = new Set(VALID_CATEGORIES);
		const inputs = ['Bebidas', 'Dairy', '', null, 'Lacteos', 'Ferretería', 999];
		for (const raw of inputs) {
			expect(canonical.has(resolveSupplierCategory(raw))).toBe(true);
		}
	});

	it('rejects a guess the model itself is unsure about', () => {
		// Below the floor the model is telling us the document was barely
		// legible; a coin-flip category is worse than an honest "Other".
		expect(resolveSupplierCategory('Bebidas', MIN_CATEGORY_CONFIDENCE - 0.01))
			.toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveSupplierCategory('Bebidas', 0)).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('accepts a guess at or above the confidence floor', () => {
		expect(resolveSupplierCategory('Bebidas', MIN_CATEGORY_CONFIDENCE)).toBe('Bebidas');
		expect(resolveSupplierCategory('Bebidas', 1)).toBe('Bebidas');
	});

	it('accepts a guess when no confidence is reported', () => {
		// An older prompt cache, or a model that dropped the field: fall back to
		// trusting the taxonomy match rather than discarding a good category.
		expect(resolveSupplierCategory('Bebidas', undefined)).toBe('Bebidas');
		expect(resolveSupplierCategory('Bebidas', null)).toBe('Bebidas');
	});

	it('treats a non-numeric confidence as absent rather than as zero', () => {
		expect(resolveSupplierCategory('Bebidas', 'high' as unknown as number)).toBe('Bebidas');
		expect(resolveSupplierCategory('Bebidas', NaN)).toBe('Bebidas');
	});

	it('uncategorised bucket is itself part of the taxonomy', () => {
		expect(VALID_CATEGORIES).toContain(UNCATEGORIZED_CATEGORY);
	});
});

describe.skipIf(!hasDbEnv)('#315 extraction-proposed category on supplier creation', () => {
	async function categoryOf(restaurantId: string, supplierId: number): Promise<string | null> {
		const [row] = await testDb
			.select({ category: suppliers.category })
			.from(suppliers)
			.where(eq(suppliers.id, supplierId));
		return row?.category ?? null;
	}

	it('tags a newly created supplier with the proposed category', async () => {
		const r = await createTestRestaurant('supplier-cat-new');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Lácteos García', testDb, 'Lácteos');
			expect(await categoryOf(r.id, id)).toBe('Lácteos');
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('falls back to the bucket when no category is proposed', async () => {
		const r = await createTestRestaurant('supplier-cat-default');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Proveedor Genérico', testDb);
			expect(await categoryOf(r.id, id)).toBe(UNCATEGORIZED_CATEGORY);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('stores the bucket rather than an off-taxonomy value', async () => {
		// Defence in depth: even if a caller skips resolveSupplierCategory, a
		// junk category must never reach the column the budgets page groups on.
		const r = await createTestRestaurant('supplier-cat-junk');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Ferretería Pepe', testDb, 'Ferretería');
			expect(await categoryOf(r.id, id)).toBe(UNCATEGORIZED_CATEGORY);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('never overwrites the category of an existing supplier', async () => {
		// The core safety property: a human classified this supplier, and a
		// later invoice's guess must not silently reclassify it.
		const r = await createTestRestaurant('supplier-cat-keep');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Makro', testDb, 'Bebidas');
			await testDb
				.update(suppliers)
				.set({ category: 'Congelados' })
				.where(eq(suppliers.id, id));

			const again = await getOrCreateSupplierId(r.id, 'makro', testDb, 'Lácteos');
			expect(again).toBe(id);
			expect(await categoryOf(r.id, id)).toBe('Congelados');
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('does not re-tag a supplier left in the bucket', async () => {
		// A supplier the user deliberately left uncategorised keeps its nudge;
		// re-tagging on invoice #2 would bypass the human decision.
		const r = await createTestRestaurant('supplier-cat-bucket');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Distribuciones Sur', testDb);
			const again = await getOrCreateSupplierId(r.id, 'Distribuciones Sur', testDb, 'Bebidas');
			expect(again).toBe(id);
			expect(await categoryOf(r.id, id)).toBe(UNCATEGORIZED_CATEGORY);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});
