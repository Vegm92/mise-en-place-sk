import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { products, recipeItems, recipes } from './schema';
import {
	MAX_RECIPE_DEPTH, addNutrition, convertQty, emptyNutrition, lineCostCents, lineNutrition,
	qtyToNumber, rateFromCents, recipeTotals, scaleNutrition, toAllergenList, toRate, wasteFactor,
	type Allergen, type NutritionTotals, type RecipeKind, type RecipeLineKind, type RecipeTotals
} from '$lib/recipes';

export type RecipeRow = typeof recipes.$inferSelect;
export type RecipeItemRow = typeof recipeItems.$inferSelect;

export type PriceSource = 'manual' | 'invoice' | 'snapshot' | 'snapshot_raw' | 'child' | 'none';

export type LineWarning =
	| 'missing-price' | 'unit-mismatch' | 'cycle' | 'missing-child'
	| 'child-no-yield' | 'nutrition-skipped';

export type RecipeWarning = 'cycle' | 'no-price' | 'depth-exceeded' | 'nutrition-partial';

export interface ResolvedPrice {
	rateUnits: number;
	baseUnit: string;
	source: Exclude<PriceSource, 'manual' | 'child' | 'none'>;
	asOf: string | null;
	supplierName: string | null;
}

export interface LineCost {
	itemId: number;
	kind: RecipeLineKind;
	name: string;
	productId: number | null;
	childRecipeId: number | null;
	netQty: number;
	grossQty: number;
	unit: string | null;
	wastePct: number;
	unitRateUnits: number | null;
	netRateUnits: number | null;
	priceSource: PriceSource;
	priceAsOf: string | null;
	supplierName: string | null;
	costCents: number;
	sharePct: number;
	allergens: Allergen[];
	nutrition: NutritionTotals | null;
	note: string | null;
	warnings: LineWarning[];
}

export interface RecipeCost extends RecipeTotals {
	recipeId: number;
	kind: RecipeKind;
	portions: number;
	yieldQty: number | null;
	yieldUnit: string | null;
	lines: LineCost[];
	allergens: Allergen[];
	nutritionTotal: NutritionTotals | null;
	nutritionPerPortion: NutritionTotals | null;
	nutritionPartial: boolean;
	nutritionCoverage: { known: number; total: number };
	missingPriceCount: number;
	depth: number;
	warnings: RecipeWarning[];
}

export interface RecipeNode {
	recipe: RecipeRow;
	items: RecipeItemRow[];
}

const WHITE = 0;
const GREY = 1;
const BLACK = 2;

export async function loadRecipeGraph(rid: string): Promise<Map<number, RecipeNode>> {
	const tdb = forTenant(rid);
	const [recipeRows, itemRows] = await Promise.all([
		db.select().from(recipes).where(tdb.scope(recipes.restaurantId)).orderBy(asc(recipes.name)),
		db.select().from(recipeItems)
			.where(tdb.scope(recipeItems.restaurantId))
			.orderBy(asc(recipeItems.recipeId), asc(recipeItems.sortOrder), asc(recipeItems.id)),
	]);

	const graph = new Map<number, RecipeNode>();
	for (const recipe of recipeRows) graph.set(recipe.id, { recipe, items: [] });
	for (const item of itemRows) graph.get(item.recipeId)?.items.push(item);
	return graph;
}

type InvoicePriceRow = {
	product_id: number;
	normalized_unit_price: string | null;
	base_unit: string | null;
	invoice_date: string | null;
	supplier_name: string | null;
};

type SnapshotPriceRow = {
	product_id: number;
	latest_normalized_price: string | null;
	base_unit: string | null;
	latest_price: string | null;
	unit: string | null;
	latest_date: string | null;
	supplier_name: string | null;
};

export async function resolveProductPrices(
	rid: string,
	productIds: number[]
): Promise<Map<number, ResolvedPrice>> {
	const out = new Map<number, ResolvedPrice>();
	const ids = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
	if (ids.length === 0) return out;

	const invoiceRows = await db.execute<InvoicePriceRow>(sql`
		SELECT DISTINCT ON (ili.product_id)
			ili.product_id, ili.normalized_unit_price, ili.base_unit,
			i.invoice_date::text AS invoice_date, s.name AS supplier_name
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		LEFT JOIN suppliers s ON s.id = i.supplier_id AND s.restaurant_id = ${rid}
		WHERE ili.restaurant_id = ${rid}
			AND i.restaurant_id = ${rid}
			AND i.deleted_at IS NULL
			AND ili.product_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
			AND ili.normalized_unit_price IS NOT NULL
			AND ili.base_unit IS NOT NULL
		ORDER BY ili.product_id, i.invoice_date DESC NULLS LAST, i.id DESC
	`);

	for (const row of invoiceRows) {
		const rate = toRate(row.normalized_unit_price);
		if (rate === null || !row.base_unit) continue;
		out.set(Number(row.product_id), {
			rateUnits: rate,
			baseUnit: row.base_unit,
			source: 'invoice',
			asOf: row.invoice_date,
			supplierName: row.supplier_name,
		});
	}

	const missing = ids.filter((id) => !out.has(id));
	if (missing.length === 0) return out;

	const snapshotRows = await db.execute<SnapshotPriceRow>(sql`
		SELECT DISTINCT ON (p.id)
			p.id AS product_id, ps.latest_normalized_price, ps.base_unit,
			ps.latest_price, ps.unit, ps.latest_date::text AS latest_date, ps.supplier_name
		FROM products p
		JOIN mv_price_snapshots ps
			ON ps.restaurant_id = ${rid} AND ps.item_key = mep_norm_key(p.canonical_name)
		WHERE p.restaurant_id = ${rid}
			AND p.id IN (${sql.join(missing.map((id) => sql`${id}`), sql`, `)})
		ORDER BY p.id, ps.latest_date DESC NULLS LAST
	`);

	for (const row of snapshotRows) {
		const productId = Number(row.product_id);
		const normalized = toRate(row.latest_normalized_price);
		if (normalized !== null && row.base_unit) {
			out.set(productId, {
				rateUnits: normalized,
				baseUnit: row.base_unit,
				source: 'snapshot',
				asOf: row.latest_date,
				supplierName: row.supplier_name,
			});
			continue;
		}
		const raw = toRate(row.latest_price);
		if (raw !== null && row.unit) {
			out.set(productId, {
				rateUnits: raw,
				baseUnit: row.unit,
				source: 'snapshot_raw',
				asOf: row.latest_date,
				supplierName: row.supplier_name,
			});
		}
	}

	return out;
}

function nullableNumber(value: string | null): number | null {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

export function computeRecipeCosts(
	graph: Map<number, RecipeNode>,
	prices: Map<number, ResolvedPrice>
): Map<number, RecipeCost> {
	const costs = new Map<number, RecipeCost>();
	const color = new Map<number, number>();

	function resolve(id: number, depth: number): RecipeCost | null {
		const cached = costs.get(id);
		if (cached) return cached;
		const node = graph.get(id);
		if (!node) return null;

		color.set(id, GREY);

		const lines: LineCost[] = [];
		const warnings = new Set<RecipeWarning>();
		const allergens = new Set<Allergen>();
		let totalCostCents = 0;
		let childDepth = 0;
		let nutritionTotal = emptyNutrition();
		let nutritionKnown = 0;
		let nutritionPartial = false;

		for (const item of node.items) {
			const lineWarnings: LineWarning[] = [];
			const kind = (item.kind ?? 'free') as RecipeLineKind;
			const netQty = qtyToNumber(item.netQuantity);
			const wastePct = qtyToNumber(item.wastePct);
			const grossQty = netQty / wasteFactor(wastePct);
			const lineAllergens = toAllergenList(item.allergens);

			let unitRateUnits: number | null = null;
			let priceSource: PriceSource = 'none';
			let priceAsOf: string | null = null;
			let supplierName: string | null = null;
			let nutrition: NutritionTotals | null = null;

			const manualRate = toRate(item.unitCost);

			if (kind === 'recipe') {
				const childId = item.childRecipeId;
				const childNode = childId === null ? null : graph.get(childId);
				if (childId === null || !childNode) {
					lineWarnings.push('missing-child');
				} else if (color.get(childId) === GREY) {
					lineWarnings.push('cycle');
					warnings.add('cycle');
				} else if (depth + 1 > MAX_RECIPE_DEPTH) {
					warnings.add('depth-exceeded');
				} else {
					const child = resolve(childId, depth + 1);
					if (child) {
						childDepth = Math.max(childDepth, child.depth + 1);
						for (const code of child.allergens) allergens.add(code);
						if (child.warnings.includes('cycle')) warnings.add('cycle');

						const childYield = child.yieldQty ?? child.portions;
						if (child.yieldQty === null) lineWarnings.push('child-no-yield');

						const yieldPerLineUnit =
							child.yieldUnit === null ? 1 : convertQty(1, item.unit, child.yieldUnit);

						if (yieldPerLineUnit === null) {
							lineWarnings.push('unit-mismatch');
						} else if (childYield > 0) {
							priceSource = 'child';
							unitRateUnits =
								(rateFromCents(child.totalCostCents) / childYield) * yieldPerLineUnit;
							const fraction = (grossQty * yieldPerLineUnit) / childYield;
							if (child.nutritionTotal) {
								nutrition = scaleNutrition(child.nutritionTotal, fraction);
							}
							if (child.nutritionPartial) nutritionPartial = true;
						}
					}
				}
			} else if (kind === 'product' && manualRate === null && item.productId !== null) {
				const resolved = prices.get(item.productId);
				if (resolved) {
					const converted = convertQty(1, item.unit, resolved.baseUnit);
					if (converted === null) {
						lineWarnings.push('unit-mismatch');
					} else {
						unitRateUnits = resolved.rateUnits * converted;
						priceSource = resolved.source;
						priceAsOf = resolved.asOf;
						supplierName = resolved.supplierName;
					}
				}
			}

			if (unitRateUnits === null && manualRate !== null) {
				unitRateUnits = manualRate;
				priceSource = 'manual';
			}

			if (unitRateUnits === null) {
				lineWarnings.push('missing-price');
				warnings.add('no-price');
			}

			const costCents = unitRateUnits === null ? 0 : lineCostCents(grossQty, unitRateUnits);
			totalCostCents += costCents;

			if (kind !== 'recipe') {
				nutrition = lineNutrition(netQty, item.unit, {
					kcal100: nullableNumber(item.kcal100),
					protein100: nullableNumber(item.protein100),
					carbs100: nullableNumber(item.carbs100),
					fat100: nullableNumber(item.fat100),
				});
			}

			if (nutrition) {
				nutritionTotal = addNutrition(nutritionTotal, nutrition);
				nutritionKnown += 1;
			} else {
				nutritionPartial = true;
				lineWarnings.push('nutrition-skipped');
			}

			for (const code of lineAllergens) allergens.add(code);

			lines.push({
				itemId: item.id,
				kind,
				name: item.name,
				productId: item.productId,
				childRecipeId: item.childRecipeId,
				netQty,
				grossQty,
				unit: item.unit,
				wastePct,
				unitRateUnits,
				netRateUnits: unitRateUnits === null ? null : unitRateUnits / wasteFactor(wastePct),
				priceSource,
				priceAsOf,
				supplierName,
				costCents,
				sharePct: 0,
				allergens: lineAllergens,
				nutrition,
				note: item.note,
				warnings: lineWarnings,
			});
		}

		for (const line of lines) {
			line.sharePct = totalCostCents > 0 ? (line.costCents / totalCostCents) * 100 : 0;
		}

		const portions = Math.max(qtyToNumber(node.recipe.portions), 0) || 1;
		const totals = recipeTotals({
			totalCostCents,
			portions,
			sellingPrice: node.recipe.sellingPrice,
			vatPct: node.recipe.vatPct,
			targetFoodCostPct: node.recipe.targetFoodCostPct,
		});

		if (nutritionPartial) warnings.add('nutrition-partial');

		const out: RecipeCost = {
			...totals,
			recipeId: id,
			kind: (node.recipe.kind ?? 'plato') as RecipeKind,
			portions,
			yieldQty: node.recipe.yieldQty === null ? null : qtyToNumber(node.recipe.yieldQty),
			yieldUnit: node.recipe.yieldUnit,
			lines,
			allergens: [...allergens],
			nutritionTotal: nutritionKnown > 0 ? nutritionTotal : null,
			nutritionPerPortion:
				nutritionKnown > 0 ? scaleNutrition(nutritionTotal, 1 / portions) : null,
			nutritionPartial,
			nutritionCoverage: { known: nutritionKnown, total: lines.length },
			missingPriceCount: lines.filter((l) => l.warnings.includes('missing-price')).length,
			depth: childDepth,
			warnings: [...warnings],
		};

		color.set(id, BLACK);
		costs.set(id, out);
		return out;
	}

	for (const id of graph.keys()) {
		if ((color.get(id) ?? WHITE) === WHITE) resolve(id, 0);
	}
	return costs;
}

function collectProductIds(graph: Map<number, RecipeNode>): number[] {
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

export async function recipeCosts(rid: string): Promise<Map<number, RecipeCost>> {
	const graph = await loadRecipeGraph(rid);
	const prices = await resolveProductPrices(rid, collectProductIds(graph));
	return computeRecipeCosts(graph, prices);
}

export async function recipeCost(rid: string, recipeId: number): Promise<RecipeCost | null> {
	const all = await recipeCosts(rid);
	return all.get(recipeId) ?? null;
}

export function wouldCycle(
	graph: Map<number, RecipeNode>,
	parentId: number,
	childId: number
): boolean {
	if (parentId === childId) return true;
	const seen = new Set<number>([childId]);
	const queue = [childId];
	while (queue.length > 0) {
		const current = queue.shift()!;
		const node = graph.get(current);
		if (!node) continue;
		for (const item of node.items) {
			const next = item.childRecipeId;
			if (next === null || seen.has(next)) continue;
			if (next === parentId) return true;
			seen.add(next);
			queue.push(next);
		}
	}
	return false;
}

export async function recipeParents(
	rid: string,
	recipeId: number
): Promise<{ id: number; name: string }[]> {
	const tdb = forTenant(rid);
	const rows = await db
		.selectDistinct({ id: recipes.id, name: recipes.name })
		.from(recipeItems)
		.innerJoin(
			recipes,
			and(eq(recipes.id, recipeItems.recipeId), tdb.scope(recipes.restaurantId))
		)
		.where(tdb.scope(recipeItems.restaurantId, eq(recipeItems.childRecipeId, recipeId)))
		.orderBy(asc(recipes.name));
	return rows;
}

export async function countRecipes(rid: string): Promise<number> {
	const tdb = forTenant(rid);
	const rows = await db
		.select({ n: sql<number>`count(*)` })
		.from(recipes)
		.where(tdb.scope(recipes.restaurantId, sql`${recipes.status} <> 'archived'`));
	return Number(rows[0]?.n ?? 0);
}

export async function linkableProducts(rid: string) {
	const tdb = forTenant(rid);
	return db
		.select({
			id: products.id,
			name: products.canonicalName,
			baseUnit: products.baseUnit,
			canonicalUnit: products.canonicalUnit,
			category: products.category,
		})
		.from(products)
		.where(tdb.scope(products.restaurantId))
		.orderBy(asc(products.canonicalName));
}

export async function recipesByIds(rid: string, ids: number[]): Promise<RecipeRow[]> {
	if (ids.length === 0) return [];
	const tdb = forTenant(rid);
	return db.select().from(recipes).where(tdb.scope(recipes.restaurantId, inArray(recipes.id, ids)));
}
