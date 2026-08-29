import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, max as sqlMax, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db, forTenant } from '$lib/server/db';
import { recipeItems, recipes } from '$lib/server/schema';
import { normalizeProductKey } from '$lib/server/normalize';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import {
	collectProductIds, computeRecipeCosts, linkableProducts, loadProductFacts, loadRecipeGraph,
	recipeAncestors, recipeParents, resolveProductPrices, wouldCycle, type RecipeNode
} from '$lib/server/recipes';
import {
	EU_ALLERGENS, RECIPE_SECTIONS, RECIPE_STATUSES, RECIPE_UNITS, isRecipeKind, isRecipeLineKind,
	isRecipeSection, isRecipeStatus, parseDecimal, parsePercent, parseQty, toAllergenList
} from '$lib/recipes';

async function requireRecipe(rid: string, id: number) {
	if (!Number.isInteger(id)) error(404, 'Not found');
	const tdb = forTenant(rid);
	const [row] = await db.select().from(recipes)
		.where(tdb.scope(recipes.restaurantId, eq(recipes.id, id))).limit(1);
	if (!row) error(404, 'Not found');
	return row;
}

function pgErrorCode(err: unknown): unknown {
	if (typeof err !== 'object' || err === null) return undefined;
	const code = (err as { code?: unknown }).code;
	if (code !== undefined) return code;
	return pgErrorCode((err as { cause?: unknown }).cause);
}

function isUniqueViolation(err: unknown): boolean {
	return pgErrorCode(err) === '23505';
}

function parseItemId(raw: FormDataEntryValue | null): number | null {
	const n = Number(raw);
	return Number.isInteger(n) && n > 0 ? n : null;
}

async function requestGraph(rid: string, locals: App.Locals): Promise<Map<number, RecipeNode>> {
	if (locals.recipeGraphCache?.rid === rid) return locals.recipeGraphCache.graph;
	const graph = await loadRecipeGraph(rid);
	locals.recipeGraphCache = { rid, graph };
	return graph;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const rid = locals.restaurantId!;
	const id = Number(params.id);

	return handleLoad('recipe-detail', async () => {
		const recipe = await requireRecipe(rid, id);
		const graph = await requestGraph(rid, locals);
		const [prices, facts] = await Promise.all([
			resolveProductPrices(rid, collectProductIds(graph, true)),
			loadProductFacts(rid, collectProductIds(graph, false)),
		]);
		const costs = computeRecipeCosts(graph, prices, facts);

		const [catalog, usedIn] = await Promise.all([
			linkableProducts(rid),
			recipeParents(rid, id),
		]);

		const ancestors = recipeAncestors(graph, id);
		const linkableRecipes = [...graph.values()]
			.map((n) => n.recipe)
			.filter((r) => r.id !== id && !ancestors.has(r.id))
			.map((r) => ({
				id: r.id,
				name: r.name,
				kind: r.kind,
				yieldQty: r.yieldQty === null ? null : Number(r.yieldQty),
				yieldUnit: r.yieldUnit,
			}));

		return {
			title: 'rec.title',
			heading: recipe.name,
			recipe: {
				id: recipe.id,
				name: recipe.name,
				kind: recipe.kind,
				status: recipe.status,
				section: recipe.section,
				portions: Number(recipe.portions),
				yieldQty: recipe.yieldQty === null ? null : Number(recipe.yieldQty),
				yieldUnit: recipe.yieldUnit,
				sellingPrice: recipe.sellingPrice,
				vatPct: recipe.vatPct,
				targetFoodCostPct: recipe.targetFoodCostPct,
				preparation: recipe.preparation,
				notes: recipe.notes,
			},
			items: (graph.get(id)?.items ?? []).map((i) => ({
				id: i.id,
				kind: i.kind,
				name: i.name,
				productId: i.productId,
				childRecipeId: i.childRecipeId,
				netQuantity: Number(i.netQuantity),
				unit: i.unit,
				unitCost: i.unitCost,
				wastePct: Number(i.wastePct),
				allergens: toAllergenList(i.allergens),
				kcal100: i.kcal100,
				protein100: i.protein100,
				carbs100: i.carbs100,
				fat100: i.fat100,
				note: i.note,
				sortOrder: i.sortOrder,
			})),
			cost: costs.get(id) ?? null,
			catalog,
			linkableRecipes,
			usedIn,
			allergens: EU_ALLERGENS,
			sections: RECIPE_SECTIONS,
			statuses: RECIPE_STATUSES,
			units: RECIPE_UNITS,
		};
	});
};

type ItemFields = {
	kind: 'free' | 'product' | 'recipe';
	name: string;
	productId: number | null;
	childRecipeId: number | null;
	netQuantity: string;
	unit: string | null;
	unitCost: string | null;
	wastePct: string;
	allergens: string[];
	kcal100: string | null;
	protein100: string | null;
	carbs100: string | null;
	fat100: string | null;
	note: string | null;
};

function readItemFields(data: FormData): ItemFields | { error: string } {
	const rawKind = String(data.get('kind') ?? 'free');
	const kind = isRecipeLineKind(rawKind) ? rawKind : 'free';
	const name = String(data.get('name') ?? '').trim();
	if (!name) return { error: 'rec.err.lineName' };

	const netQuantity = parseQty(String(data.get('netQuantity') ?? ''));
	if (netQuantity === null) return { error: 'rec.err.qty' };

	const wastePct = parsePercent(String(data.get('wastePct') ?? '0') || '0', 99.99);
	if (wastePct === null) return { error: 'rec.err.waste' };

	const rawUnit = String(data.get('unit') ?? '').trim();
	if (!(RECIPE_UNITS as readonly string[]).includes(rawUnit)) return { error: 'rec.err.unit' };

	const rawCost = String(data.get('unitCost') ?? '').trim();
	const unitCost = rawCost === '' ? null : parseDecimal(rawCost, 4);
	if (rawCost !== '' && unitCost === null) return { error: 'rec.err.cost' };

	const productIdRaw = Number(data.get('productId'));
	const childIdRaw = Number(data.get('childRecipeId'));
	const productId = kind === 'product' && Number.isInteger(productIdRaw) && productIdRaw > 0
		? productIdRaw : null;
	const childRecipeId = kind === 'recipe' && Number.isInteger(childIdRaw) && childIdRaw > 0
		? childIdRaw : null;
	if (kind === 'recipe' && childRecipeId === null) return { error: 'rec.err.childRequired' };
	if (kind === 'product' && productId === null && unitCost === null) {
		return { error: 'rec.err.productRequired' };
	}

	const macro = (key: string) => {
		const raw = String(data.get(key) ?? '').trim();
		return raw === '' ? null : parseDecimal(raw, 2);
	};

	return {
		kind,
		name,
		productId,
		childRecipeId,
		netQuantity,
		unit: rawUnit,
		unitCost,
		wastePct,
		allergens: toAllergenList(data.getAll('allergens').map(String)),
		kcal100: macro('kcal100'),
		protein100: macro('protein100'),
		carbs100: macro('carbs100'),
		fat100: macro('fat100'),
		note: String(data.get('note') ?? '').trim() || null,
	};
}

async function linkTargetError(
	rid: string,
	recipeId: number,
	fields: ItemFields,
	graph: Map<number, RecipeNode>
) {
	const tdb = forTenant(rid);
	if (fields.productId !== null) {
		const rows = await db.execute<{ id: number }>(sql`
			SELECT id FROM products WHERE restaurant_id = ${rid} AND id = ${fields.productId} LIMIT 1
		`);
		if (rows.length === 0) return 'rec.err.unknownProduct';
	}
	if (fields.childRecipeId !== null) {
		const [child] = await db.select({ id: recipes.id }).from(recipes)
			.where(tdb.scope(recipes.restaurantId, eq(recipes.id, fields.childRecipeId))).limit(1);
		if (!child) return 'rec.err.unknownRecipe';
		if (wouldCycle(graph, recipeId, fields.childRecipeId)) return 'rec.err.cycle';
	}
	return null;
}

export const actions: Actions = {
	updateRecipe: async ({ params, request, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		await requireRecipe(rid, id);
		const tdb = forTenant(rid);
		const data = await request.formData();

		const name = String(data.get('name') ?? '').trim();
		const nameKey = normalizeProductKey(name);
		if (!name || !nameKey) return fail(422, { error: 'rec.err.nameRequired' });

		const portions = parseQty(String(data.get('portions') ?? '1'));
		if (portions === null) return fail(422, { error: 'rec.err.portions' });

		const rawPrice = String(data.get('sellingPrice') ?? '').trim();
		const sellingPrice = rawPrice === '' ? null : parseDecimal(rawPrice, 2);
		if (rawPrice !== '' && sellingPrice === null) return fail(422, { error: 'rec.err.price' });

		const rawYieldQty = String(data.get('yieldQty') ?? '').trim();
		const yieldQty = rawYieldQty === '' ? null : parseQty(rawYieldQty);
		if (rawYieldQty !== '' && yieldQty === null) return fail(422, { error: 'rec.err.yield' });

		const rawVatPct = String(data.get('vatPct') ?? '').trim();
		const vatPct = rawVatPct === '' ? null : parsePercent(rawVatPct, 100);
		if (rawVatPct !== '' && vatPct === null) return fail(422, { error: 'rec.err.vat' });

		const rawTargetFoodCostPct = String(data.get('targetFoodCostPct') ?? '').trim();
		const targetFoodCostPct = rawTargetFoodCostPct === ''
			? null : parsePercent(rawTargetFoodCostPct, 100);
		if (rawTargetFoodCostPct !== '' && targetFoodCostPct === null) {
			return fail(422, { error: 'rec.err.targetFoodCost' });
		}

		const rawYieldUnit = String(data.get('yieldUnit') ?? '').trim();
		const rawKind = String(data.get('kind') ?? 'plato');
		const rawStatus = String(data.get('status') ?? 'draft');
		const rawSection = String(data.get('section') ?? '');

		try {
			await db.update(recipes).set({
				name,
				nameKey,
				kind: isRecipeKind(rawKind) ? rawKind : 'plato',
				status: isRecipeStatus(rawStatus) ? rawStatus : 'draft',
				section: isRecipeSection(rawSection) ? rawSection : null,
				portions,
				yieldQty,
				yieldUnit: (RECIPE_UNITS as readonly string[]).includes(rawYieldUnit) ? rawYieldUnit : null,
				sellingPrice,
				vatPct,
				targetFoodCostPct,
				preparation: String(data.get('preparation') ?? '').trim() || null,
				notes: String(data.get('notes') ?? '').trim() || null,
				updatedAt: new Date(),
			}).where(tdb.scope(recipes.restaurantId, eq(recipes.id, id)));
		} catch (err) {
			if (isUniqueViolation(err)) return fail(409, { error: 'rec.err.duplicate' });
			throw err;
		}

		return { ok: 'rec.ok.saved' };
	},

	addItem: async ({ params, request, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		await requireRecipe(rid, id);
		const tdb = forTenant(rid);

		const fields = readItemFields(await request.formData());
		if ('error' in fields) return fail(422, { error: fields.error });

		const graph = await requestGraph(rid, locals);
		const linkError = await linkTargetError(rid, id, fields, graph);
		if (linkError) return fail(422, { error: linkError });

		const [{ top }] = await db.select({ top: sqlMax(recipeItems.sortOrder) })
			.from(recipeItems)
			.where(tdb.scope(recipeItems.restaurantId, eq(recipeItems.recipeId, id)));

		const [inserted] = await db.insert(recipeItems).values({
			restaurantId: rid,
			recipeId: id,
			sortOrder: (top ?? 0) + 1,
			...fields,
		}).returning();

		graph.get(id)?.items.push(inserted);

		return { ok: 'rec.ok.lineAdded' };
	},

	updateItem: async ({ params, request, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		await requireRecipe(rid, id);
		const tdb = forTenant(rid);

		const data = await request.formData();
		const itemId = parseItemId(data.get('itemId'));
		if (itemId === null) return fail(422, { error: 'rec.err.lineId' });

		const fields = readItemFields(data);
		if ('error' in fields) return fail(422, { error: fields.error });

		const graph = await requestGraph(rid, locals);
		const linkError = await linkTargetError(rid, id, fields, graph);
		if (linkError) return fail(422, { error: linkError });

		const updated = await db.update(recipeItems).set(fields).where(
			tdb.scope(recipeItems.restaurantId, and(
				eq(recipeItems.id, itemId),
				eq(recipeItems.recipeId, id)
			))
		).returning();
		if (updated.length === 0) return fail(404, { error: 'rec.err.lineNotFound' });

		const node = graph.get(id);
		if (node) {
			const idx = node.items.findIndex((i) => i.id === itemId);
			if (idx >= 0) node.items[idx] = updated[0];
			else node.items.push(updated[0]);
		}

		return { ok: 'rec.ok.saved' };
	},

	deleteItem: async ({ params, request, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		await requireRecipe(rid, id);
		const tdb = forTenant(rid);
		const data = await request.formData();
		const itemId = parseItemId(data.get('itemId'));
		if (itemId === null) return fail(422, { error: 'rec.err.lineId' });

		const deleted = await db.delete(recipeItems).where(
			tdb.scope(recipeItems.restaurantId, and(
				eq(recipeItems.id, itemId),
				eq(recipeItems.recipeId, id)
			))
		).returning({ id: recipeItems.id });
		if (deleted.length === 0) return fail(404, { error: 'rec.err.lineNotFound' });

		return { ok: 'rec.ok.lineDeleted' };
	},

	duplicate: async ({ params, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		if (!(await rateLimitScoped({ scope: 'tenant', name: 'recipe-create', max: 30 }, { restaurantId: rid }))) {
			return fail(429, { error: 'rec.err.rateLimited' });
		}
		const source = await requireRecipe(rid, id);
		const tdb = forTenant(rid);

		const MAX_COPY_ATTEMPTS = 9;
		let newId: number | null = null;

		for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS && newId === null; attempt++) {
			const name = attempt === 1 ? `${source.name} (copia)` : `${source.name} (copia ${attempt})`;
			const nameKey = normalizeProductKey(name);
			if (!nameKey) return fail(422, { error: 'rec.err.nameRequired' });

			await db.transaction(async (tx) => {
				const inserted = await tx.insert(recipes).values({
					restaurantId: rid,
					name,
					nameKey,
					kind: source.kind,
					status: 'draft',
					section: source.section,
					portions: source.portions,
					yieldQty: source.yieldQty,
					yieldUnit: source.yieldUnit,
					sellingPrice: source.sellingPrice,
					vatPct: source.vatPct,
					targetFoodCostPct: source.targetFoodCostPct,
					preparation: source.preparation,
					notes: source.notes,
				}).onConflictDoNothing().returning({ id: recipes.id });
				if (inserted.length === 0) return;
				newId = inserted[0].id;

				const lines = await tx.select().from(recipeItems)
					.where(tdb.scope(recipeItems.restaurantId, eq(recipeItems.recipeId, id)))
					.orderBy(asc(recipeItems.sortOrder));
				if (lines.length === 0) return;

				await tx.insert(recipeItems).values(lines.map((line) => ({
					restaurantId: rid,
					recipeId: newId!,
					kind: line.kind,
					name: line.name,
					productId: line.productId,
					childRecipeId: line.childRecipeId,
					netQuantity: line.netQuantity,
					unit: line.unit,
					unitCost: line.unitCost,
					wastePct: line.wastePct,
					allergens: line.allergens,
					kcal100: line.kcal100,
					protein100: line.protein100,
					carbs100: line.carbs100,
					fat100: line.fat100,
					note: line.note,
					sortOrder: line.sortOrder,
				})));
			});
		}

		if (newId === null) return fail(409, { error: 'rec.err.duplicate' });
		redirect(303, `/recipes/${newId}`);
	},

	delete: async ({ params, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		await requireRecipe(rid, id);
		const tdb = forTenant(rid);

		if ((await recipeParents(rid, id)).length > 0) return fail(409, { error: 'rec.err.inUse' });

		await db.transaction(async (tx) => {
			await tx.delete(recipeItems)
				.where(tdb.scope(recipeItems.restaurantId, eq(recipeItems.recipeId, id)));
			await tx.delete(recipes).where(tdb.scope(recipes.restaurantId, eq(recipes.id, id)));
		});
		redirect(303, '/recipes');
	},
};
