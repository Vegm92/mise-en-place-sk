import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, max as sqlMax, ne, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db, forTenant } from '$lib/server/db';
import { recipeItems, recipes } from '$lib/server/schema';
import { normalizeProductKey } from '$lib/server/normalize';
import { checkRateLimit } from '$lib/server/rate-limiter';
import {
	computeRecipeCosts, linkableProducts, loadRecipeGraph, recipeParents, resolveProductPrices,
	wouldCycle, type RecipeNode
} from '$lib/server/recipes';
import {
	EU_ALLERGENS, RECIPE_SECTIONS, RECIPE_STATUSES, RECIPE_UNITS, isRecipeKind, isRecipeLineKind,
	isRecipeSection, isRecipeStatus, parseDecimal, parsePercent, parseQty, toAllergenList
} from '$lib/recipes';

function productIdsOf(graph: Map<number, RecipeNode>): number[] {
	const ids: number[] = [];
	for (const node of graph.values()) {
		for (const item of node.items) {
			if (item.kind === 'product' && item.productId !== null && item.unitCost === null) {
				ids.push(item.productId);
			}
		}
	}
	return ids;
}

async function requireRecipe(rid: string, id: number) {
	if (!Number.isInteger(id)) error(404, 'Not found');
	const tdb = forTenant(rid);
	const [row] = await db.select().from(recipes)
		.where(tdb.scope(recipes.restaurantId, eq(recipes.id, id))).limit(1);
	if (!row) error(404, 'Not found');
	return row;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const rid = locals.restaurantId!;
	const id = Number(params.id);

	return handleLoad('recipe-detail', async () => {
		const recipe = await requireRecipe(rid, id);
		const graph = await loadRecipeGraph(rid);
		const prices = await resolveProductPrices(rid, productIdsOf(graph));
		const costs = computeRecipeCosts(graph, prices);

		const [catalog, usedIn] = await Promise.all([
			linkableProducts(rid),
			recipeParents(rid, id),
		]);

		const linkableRecipes = [...graph.values()]
			.map((n) => n.recipe)
			.filter((r) => r.id !== id && !wouldCycle(graph, id, r.id))
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

async function linkTargetError(rid: string, recipeId: number, fields: ItemFields) {
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
		const graph = await loadRecipeGraph(rid);
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
		const rawYieldUnit = String(data.get('yieldUnit') ?? '').trim();
		const rawKind = String(data.get('kind') ?? 'plato');
		const rawStatus = String(data.get('status') ?? 'draft');
		const rawSection = String(data.get('section') ?? '');

		const duplicate = await db.select({ id: recipes.id }).from(recipes)
			.where(tdb.scope(recipes.restaurantId, and(eq(recipes.nameKey, nameKey), ne(recipes.id, id))))
			.limit(1);
		if (duplicate.length > 0) return fail(409, { error: 'rec.err.duplicate' });

		await db.update(recipes).set({
			name,
			nameKey,
			kind: isRecipeKind(rawKind) ? rawKind : 'plato',
			status: isRecipeStatus(rawStatus) ? rawStatus : 'draft',
			section: isRecipeSection(rawSection) ? rawSection : null,
			portions,
			yieldQty: rawYieldQty === '' ? null : parseQty(rawYieldQty),
			yieldUnit: (RECIPE_UNITS as readonly string[]).includes(rawYieldUnit) ? rawYieldUnit : null,
			sellingPrice,
			vatPct: parsePercent(String(data.get('vatPct') ?? ''), 100),
			targetFoodCostPct: parsePercent(String(data.get('targetFoodCostPct') ?? ''), 100),
			preparation: String(data.get('preparation') ?? '').trim() || null,
			notes: String(data.get('notes') ?? '').trim() || null,
			updatedAt: new Date(),
		}).where(tdb.scope(recipes.restaurantId, eq(recipes.id, id)));

		return { ok: 'rec.ok.saved' };
	},

	addItem: async ({ params, request, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		await requireRecipe(rid, id);
		const tdb = forTenant(rid);

		const fields = readItemFields(await request.formData());
		if ('error' in fields) return fail(422, { error: fields.error });
		const linkError = await linkTargetError(rid, id, fields);
		if (linkError) return fail(422, { error: linkError });

		const [{ top }] = await db.select({ top: sqlMax(recipeItems.sortOrder) })
			.from(recipeItems)
			.where(tdb.scope(recipeItems.restaurantId, eq(recipeItems.recipeId, id)));

		await db.insert(recipeItems).values({
			restaurantId: rid,
			recipeId: id,
			sortOrder: (top ?? 0) + 1,
			...fields,
		});
		return { ok: 'rec.ok.lineAdded' };
	},

	updateItem: async ({ params, request, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		await requireRecipe(rid, id);
		const tdb = forTenant(rid);

		const data = await request.formData();
		const itemId = Number(data.get('itemId'));
		if (!Number.isInteger(itemId)) return fail(422, { error: 'rec.err.lineName' });

		const fields = readItemFields(data);
		if ('error' in fields) return fail(422, { error: fields.error });
		const linkError = await linkTargetError(rid, id, fields);
		if (linkError) return fail(422, { error: linkError });

		await db.update(recipeItems).set(fields).where(
			tdb.scope(recipeItems.restaurantId, and(
				eq(recipeItems.id, itemId),
				eq(recipeItems.recipeId, id)
			))
		);
		return { ok: 'rec.ok.saved' };
	},

	deleteItem: async ({ params, request, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		await requireRecipe(rid, id);
		const tdb = forTenant(rid);
		const itemId = Number((await request.formData()).get('itemId'));
		if (!Number.isInteger(itemId)) return fail(422, { error: 'rec.err.lineName' });

		await db.delete(recipeItems).where(
			tdb.scope(recipeItems.restaurantId, and(
				eq(recipeItems.id, itemId),
				eq(recipeItems.recipeId, id)
			))
		);
		return { ok: 'rec.ok.lineDeleted' };
	},

	duplicate: async ({ params, locals }) => {
		const rid = locals.restaurantId!;
		const id = Number(params.id);
		if (!(await checkRateLimit(`recipe-create:${rid}`, 30))) {
			return fail(429, { error: 'rec.err.rateLimited' });
		}
		const source = await requireRecipe(rid, id);
		const tdb = forTenant(rid);

		let newId: number | null = null;
		await db.transaction(async (tx) => {
			const name = `${source.name} (copia)`;
			const inserted = await tx.insert(recipes).values({
				restaurantId: rid,
				name,
				nameKey: normalizeProductKey(name),
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
