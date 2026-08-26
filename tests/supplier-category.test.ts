/**
 * Guard for the LLM-proposed supplier category (issue #315).
 *
 * Extraction may propose a category for a supplier nobody has classified yet.
 * The model is asked for one exact string from VALID_CATEGORIES, but a model
 * will happily return a translation, an invented category, or a lower-cased
 * unaccented variant. `resolveCategory` is the only door into
 * `suppliers.category` for machine-proposed values: it maps a recognisable
 * variant back onto its canonical string and turns everything else into the
 * uncategorised bucket, so a bad guess degrades into "Other" + the existing
 * categorisation nudge instead of poisoning the taxonomy.
 *
 * Pure assertions — no DB, no network.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
	VALID_CATEGORIES,
	UNCATEGORIZED_CATEGORY,
	MIN_CATEGORY_CONFIDENCE,
	resolveCategory,
} from '../src/lib/constants';
import { getOrCreateSupplierId } from '../src/lib/server/supplier';
import { runCategorySuggestion } from '../src/lib/server/alert-engine';
import { invoiceLineItems, invoices, products, suppliers, systemNotifications } from '../src/lib/server/schema';
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

describe('resolveCategory', () => {
	it('accepts every canonical category unchanged', () => {
		for (const cat of VALID_CATEGORIES) {
			expect(resolveCategory(cat)).toBe(cat);
		}
	});

	it('maps case and whitespace variants back onto the canonical string', () => {
		expect(resolveCategory('  lácteos  ')).toBe('Lácteos');
		expect(resolveCategory('BEBIDAS')).toBe('Bebidas');
		expect(resolveCategory('vinos y cavas')).toBe('Vinos y Cavas');
	});

	it('maps unaccented variants back onto the canonical string', () => {
		// Models routinely drop diacritics; that is a spelling slip, not a
		// different category.
		expect(resolveCategory('Lacteos')).toBe('Lácteos');
		expect(resolveCategory('Panaderia y Bolleria')).toBe('Panadería y Bollería');
		expect(resolveCategory('Especias y Condimentos')).toBe('Especias y Condimentos');
	});

	it('falls back to the uncategorised bucket for invented categories', () => {
		expect(resolveCategory('Ferretería')).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveCategory('Material de Oficina')).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('falls back for translations of a real category', () => {
		// "Dairy" is Lácteos, but accepting it would mean accepting arbitrary
		// model output; the nudge is the safety net.
		expect(resolveCategory('Dairy')).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveCategory('Beverages')).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('falls back for missing, empty and non-string input', () => {
		expect(resolveCategory(null)).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveCategory(undefined)).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveCategory('')).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveCategory('   ')).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveCategory(42)).toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveCategory({ category: 'Bebidas' })).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('never returns a value outside the canonical taxonomy', () => {
		const canonical = new Set(VALID_CATEGORIES);
		const inputs = ['Bebidas', 'Dairy', '', null, 'Lacteos', 'Ferretería', 999];
		for (const raw of inputs) {
			expect(canonical.has(resolveCategory(raw))).toBe(true);
		}
	});

	it('rejects a guess the model itself is unsure about', () => {
		// Below the floor the model is telling us the document was barely
		// legible; a coin-flip category is worse than an honest "Other".
		expect(resolveCategory('Bebidas', MIN_CATEGORY_CONFIDENCE - 0.01))
			.toBe(UNCATEGORIZED_CATEGORY);
		expect(resolveCategory('Bebidas', 0)).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('accepts a guess at or above the confidence floor', () => {
		expect(resolveCategory('Bebidas', MIN_CATEGORY_CONFIDENCE)).toBe('Bebidas');
		expect(resolveCategory('Bebidas', 1)).toBe('Bebidas');
	});

	it('accepts a guess when no confidence is reported', () => {
		// An older prompt cache, or a model that dropped the field: fall back to
		// trusting the taxonomy match rather than discarding a good category.
		expect(resolveCategory('Bebidas', undefined)).toBe('Bebidas');
		expect(resolveCategory('Bebidas', null)).toBe('Bebidas');
	});

	it('treats a non-numeric confidence as absent rather than as zero', () => {
		expect(resolveCategory('Bebidas', 'high' as unknown as number)).toBe('Bebidas');
		expect(resolveCategory('Bebidas', NaN)).toBe('Bebidas');
	});

	it('uncategorised bucket is itself part of the taxonomy', () => {
		expect(VALID_CATEGORIES).toContain(UNCATEGORIZED_CATEGORY);
	});
});

describe.skipIf(!hasDbEnv)('runCategorySuggestion — proposals the resolver collapsed', () => {
	// A collapsed guess no longer short-circuits: the supplier's own delivery
	// notes get a say (Phase 3 — "el proveedor se caracteriza por sus
	// albaranes"). With no lines to speak from, there is still nothing to offer.
	it('offers nothing when neither extraction nor lines name a category', async () => {
		const r = await createTestRestaurant('cat-suggest-collapsed');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Sin Señal', testDb);
			expect(await runCategorySuggestion(id, r.id, UNCATEGORIZED_CATEGORY)).toEqual([]);
			expect(await runCategorySuggestion(id, r.id, '')).toEqual([]);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('offers nothing for a category outside the taxonomy', async () => {
		const r = await createTestRestaurant('cat-suggest-offtax');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Ferretería Pepe', testDb);
			expect(await runCategorySuggestion(id, r.id, 'Ferretería')).toEqual([]);
			expect(await runCategorySuggestion(id, r.id, 'Dairy')).toEqual([]);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});

describe.skipIf(!hasDbEnv)('runCategorySuggestion — the tag proposed by the supplier\'s own lines', () => {
	async function seedLines(
		restaurantId: string,
		supplierId: number,
		lines: Array<[string, string | null, number]>,
	) {
		const [inv] = await testDb.insert(invoices)
			.values({ restaurantId, supplierId, invoiceNumber: `L-${supplierId}`, invoiceDate: '2026-05-04', totalAmount: '0.00', status: 'pending' })
			.returning({ id: invoices.id });
		for (const [description, category, amount] of lines) {
			let productId: number | null = null;
			if (category !== null) {
				const [p] = await testDb.insert(products)
					.values({ restaurantId, canonicalName: description, nameKey: description.toLowerCase(), category })
					.returning({ id: products.id });
				productId = p.id;
			}
			await testDb.insert(invoiceLineItems).values({
				restaurantId, invoiceId: inv.id, productId, description,
				quantity: 1, unit: 'ud', unitPrice: amount.toFixed(2), totalPrice: amount.toFixed(2),
			});
		}
	}

	it('proposes the category that carries most of the supplier\'s line spend', async () => {
		const r = await createTestRestaurant('cat-suggest-dominant');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Distribuciones Mixtas', testDb);
			await seedLines(r.id, id, [
				['Tomate pera', 'Frutas y Verduras', 800],
				['Lejía', 'Productos de Limpieza', 100],
			]);
			const alerts = await runCategorySuggestion(id, r.id, UNCATEGORIZED_CATEGORY);
			expect(alerts).toHaveLength(1);
			expect(alerts[0].payload).toMatchObject({
				suggestedCategory: 'Frutas y Verduras',
				source: 'lines',
			});
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('stays quiet when no category dominates', async () => {
		const r = await createTestRestaurant('cat-suggest-nodominant');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Generalista SL', testDb);
			await seedLines(r.id, id, [
				['Tomate pera', 'Frutas y Verduras', 100],
				['Lejía', 'Productos de Limpieza', 100],
				['Merluza', 'Pescados y Mariscos', 100],
			]);
			expect(await runCategorySuggestion(id, r.id, UNCATEGORIZED_CATEGORY)).toEqual([]);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('prefers the extraction\'s own guess over the lines', async () => {
		const r = await createTestRestaurant('cat-suggest-extraction-wins');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Bodega Central', testDb);
			await seedLines(r.id, id, [['Tomate pera', 'Frutas y Verduras', 900]]);
			const alerts = await runCategorySuggestion(id, r.id, 'Vinos y Cavas');
			expect(alerts[0].payload).toMatchObject({
				suggestedCategory: 'Vinos y Cavas',
				source: 'extraction',
			});
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});

describe.skipIf(!hasDbEnv)('#315 suggesting a category for a supplier left in the bucket', () => {
	/** Insert a notification the way saveAlerts would, minus the invoice FK. */
	async function raise(restaurantId: string, type: string, payload: Record<string, unknown>) {
		await testDb.insert(systemNotifications).values({
			restaurantId,
			notificationType: type,
			message: 'test',
			payload: JSON.stringify(payload),
			status: 'pending',
		});
	}

	async function pending(restaurantId: string, type: string) {
		return testDb
			.select({ payload: systemNotifications.payload, status: systemNotifications.status })
			.from(systemNotifications)
			.where(and(
				eq(systemNotifications.restaurantId, restaurantId),
				eq(systemNotifications.notificationType, type),
			));
	}

	it('offers the category for a supplier still in the bucket', async () => {
		const r = await createTestRestaurant('cat-suggest-offer');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Distribuciones Sur', testDb);
			const alerts = await runCategorySuggestion(id, r.id, 'Bebidas');
			expect(alerts).toHaveLength(1);
			expect(alerts[0].notificationType).toBe('supplier_category_suggested');
			// The user-visible text is an i18n key + vars, not baked-in prose, so
			// the bell renders it in the reader's locale.
			expect(alerts[0].payload).toMatchObject({
				supplierId: id,
				suggestedCategory: 'Bebidas',
				messageKey: 'notif.msg.catSuggested',
				messageVars: { supplier: 'Distribuciones Sur', category: 'Bebidas' },
			});
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('never second-guesses a supplier someone already classified', async () => {
		const r = await createTestRestaurant('cat-suggest-classified');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Makro', testDb, 'Congelados');
			expect(await runCategorySuggestion(id, r.id, 'Bebidas')).toEqual([]);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('offers a category for a legacy supplier carrying NULL', async () => {
		const r = await createTestRestaurant('cat-suggest-legacy');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Proveedor Antiguo', testDb);
			await testDb.update(suppliers).set({ category: null }).where(eq(suppliers.id, id));
			const alerts = await runCategorySuggestion(id, r.id, 'Lácteos');
			expect(alerts).toHaveLength(1);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('offers once per supplier, even after the suggestion was handled', async () => {
		// A suggestion on every invoice would be nagging.
		const r = await createTestRestaurant('cat-suggest-dedup');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Bebidas Norte', testDb);
			const first = await runCategorySuggestion(id, r.id, 'Bebidas');
			expect(first).toHaveLength(1);
			await raise(r.id, first[0].notificationType, first[0].payload as Record<string, unknown>);

			expect(await runCategorySuggestion(id, r.id, 'Bebidas')).toEqual([]);

			// Dismissed (status 'sent') must not resurrect it either.
			await testDb
				.update(systemNotifications)
				.set({ status: 'sent' })
				.where(eq(systemNotifications.restaurantId, r.id));
			expect(await runCategorySuggestion(id, r.id, 'Vinos y Cavas')).toEqual([]);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('supersedes the plain nudge for the same supplier', async () => {
		// Naming a category is strictly more useful than asking for one, so the
		// two must not stack up in the bell.
		const r = await createTestRestaurant('cat-suggest-supersede');
		try {
			const id = await getOrCreateSupplierId(r.id, 'Almacenes Vega', testDb);
			await raise(r.id, 'supplier_uncategorized', { supplierId: id, supplierName: 'Almacenes Vega' });
			expect((await pending(r.id, 'supplier_uncategorized'))[0].status).toBe('pending');

			const alerts = await runCategorySuggestion(id, r.id, 'Bebidas');
			expect(alerts).toHaveLength(1);
			expect((await pending(r.id, 'supplier_uncategorized'))[0].status).toBe('sent');
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('leaves another supplier\'s nudge alone when superseding', async () => {
		const r = await createTestRestaurant('cat-suggest-scoped');
		try {
			const mine = await getOrCreateSupplierId(r.id, 'Proveedor A', testDb);
			const other = await getOrCreateSupplierId(r.id, 'Proveedor B', testDb);
			await raise(r.id, 'supplier_uncategorized', { supplierId: other, supplierName: 'Proveedor B' });

			await runCategorySuggestion(mine, r.id, 'Bebidas');

			const rows = await pending(r.id, 'supplier_uncategorized');
			expect(rows).toHaveLength(1);
			expect(rows[0].status).toBe('pending');
		} finally {
			await cleanupTestRestaurant(r.id);
		}
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
		// Defence in depth: even if a caller skips resolveCategory, a
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
