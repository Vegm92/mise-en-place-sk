import { monthBounds, monthOf } from '$lib/period';
import { shiftMonth } from '$lib/formatters';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { products, recipeItems, recipes } from './schema';
import {
	EU_ALLERGENS, addNutrition, convertQty, emptyNutrition, lineCostCents, lineNutrition,
	qtyToNumber, rateFromCents, recipeTotals, scaleNutrition, toAllergenList, toRate, wasteFactor,
	type Allergen, type NutritionTotals, type RecipeKind, type RecipeLineKind, type RecipeTotals,
	type RecipeWarning
} from '$lib/recipes';

export type RecipeRow = typeof recipes.$inferSelect;
export type RecipeItemRow = typeof recipeItems.$inferSelect;

export type PriceSource = 'manual' | 'invoice' | 'snapshot' | 'snapshot_raw' | 'child' | 'none';

export type LineWarning =
	| 'missing-price' | 'unit-mismatch' | 'cycle' | 'missing-child'
	| 'child-no-yield' | 'nutrition-skipped';

export type { RecipeWarning };

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

export interface ProductFacts {
	allergens: Allergen[];
	kcal100: number | null;
	protein100: number | null;
	carbs100: number | null;
	fat100: number | null;
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
	productIds: number[],
	asOf: string | null = null
): Promise<Map<number, ResolvedPrice>> {
	const out = new Map<number, ResolvedPrice>();
	const ids = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
	if (ids.length === 0) return out;

	const asOfFilter = asOf ? sql`AND i.invoice_date <= ${asOf}::date` : sql``;
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
			${asOfFilter}
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
	if (missing.length === 0 || asOf) return out;

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

export async function loadProductFacts(
	rid: string,
	productIds: number[]
): Promise<Map<number, ProductFacts>> {
	const out = new Map<number, ProductFacts>();
	const ids = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
	if (ids.length === 0) return out;

	const tdb = forTenant(rid);
	const rows = await db.select({
		id: products.id,
		allergens: products.allergens,
		kcal100: products.kcal100,
		protein100: products.protein100,
		carbs100: products.carbs100,
		fat100: products.fat100,
	}).from(products).where(tdb.scope(products.restaurantId, inArray(products.id, ids)));

	for (const row of rows) {
		out.set(row.id, {
			allergens: toAllergenList(row.allergens),
			kcal100: nullableNumber(row.kcal100),
			protein100: nullableNumber(row.protein100),
			carbs100: nullableNumber(row.carbs100),
			fat100: nullableNumber(row.fat100),
		});
	}
	return out;
}

function nullableNumber(value: string | null): number | null {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

interface RecipeResolveCtx {
	graph: Map<number, RecipeNode>;
	prices: Map<number, ResolvedPrice>;
	facts: Map<number, ProductFacts>;
	color: Map<number, number>;
	resolveNode: (id: number, depth: number) => RecipeCost | null;
}

interface LineAggregate {
	warnings: Set<RecipeWarning>;
	allergens: Set<Allergen>;
	childDepth: number;
	nutritionTotal: NutritionTotals;
	nutritionKnown: number;
	nutritionPartial: boolean;
}

interface RecipeLinePriceResult {
	unitRateUnits: number | null;
	priceSource: PriceSource;
	nutrition: NutritionTotals | null;
	lineWarnings: LineWarning[];
}

function resolveRecipeLinePrice(
	item: RecipeItemRow,
	depth: number,
	netQty: number,
	ctx: RecipeResolveCtx,
	agg: LineAggregate
): RecipeLinePriceResult {
	const none: RecipeLinePriceResult = {
		unitRateUnits: null, priceSource: 'none', nutrition: null, lineWarnings: [],
	};
	const lineWarnings: LineWarning[] = [];
	const childId = item.childRecipeId;
	const childNode = childId === null ? null : ctx.graph.get(childId);

	if (childId === null || !childNode) {
		return { ...none, lineWarnings: ['missing-child'] };
	}

	if (ctx.color.get(childId) === GREY) {
		agg.warnings.add('cycle');
		return { ...none, lineWarnings: ['cycle'] };
	}

	const child = ctx.resolveNode(childId, depth + 1);
	if (!child) return { ...none, lineWarnings };

	agg.childDepth = Math.max(agg.childDepth, child.depth + 1);
	for (const code of child.allergens) agg.allergens.add(code);
	if (child.warnings.includes('cycle')) agg.warnings.add('cycle');

	const childYield = child.yieldQty ?? child.portions;
	if (child.yieldQty === null) lineWarnings.push('child-no-yield');

	const yieldPerLineUnit =
		child.yieldUnit === null ? 1 : convertQty(1, item.unit, child.yieldUnit);

	if (yieldPerLineUnit === null) {
		lineWarnings.push('unit-mismatch');
		return { ...none, lineWarnings };
	}

	if (childYield <= 0) return { ...none, lineWarnings };

	const unitRateUnits = (rateFromCents(child.totalCostCents) / childYield) * yieldPerLineUnit;
	const nutritionFraction = (netQty * yieldPerLineUnit) / childYield;
	const nutrition = child.nutritionTotal
		? scaleNutrition(child.nutritionTotal, nutritionFraction)
		: null;
	if (child.nutritionPartial) agg.nutritionPartial = true;

	return { unitRateUnits, priceSource: 'child', nutrition, lineWarnings };
}

interface ProductLinePriceResult {
	unitRateUnits: number | null;
	priceSource: PriceSource;
	priceAsOf: string | null;
	supplierName: string | null;
	lineWarnings: LineWarning[];
}

function resolveProductLinePrice(
	item: RecipeItemRow,
	prices: Map<number, ResolvedPrice>
): ProductLinePriceResult {
	const none: ProductLinePriceResult = {
		unitRateUnits: null, priceSource: 'none', priceAsOf: null, supplierName: null, lineWarnings: [],
	};
	const resolved = item.productId === null ? undefined : prices.get(item.productId);
	if (!resolved) return none;

	const converted = convertQty(1, item.unit, resolved.baseUnit);
	if (converted === null) return { ...none, lineWarnings: ['unit-mismatch'] };

	return {
		unitRateUnits: resolved.rateUnits * converted,
		priceSource: resolved.source,
		priceAsOf: resolved.asOf,
		supplierName: resolved.supplierName,
		lineWarnings: [],
	};
}

function computeOwnLineNutrition(
	item: RecipeItemRow,
	inherited: ProductFacts | undefined,
	netQty: number
): NutritionTotals | null {
	const own = {
		kcal100: nullableNumber(item.kcal100),
		protein100: nullableNumber(item.protein100),
		carbs100: nullableNumber(item.carbs100),
		fat100: nullableNumber(item.fat100),
	};
	const hasOwn = Object.values(own).some((v) => v !== null);
	return lineNutrition(netQty, item.unit, hasOwn ? own : {
		kcal100: inherited?.kcal100 ?? null,
		protein100: inherited?.protein100 ?? null,
		carbs100: inherited?.carbs100 ?? null,
		fat100: inherited?.fat100 ?? null,
	});
}

function computeRecipeLine(
	item: RecipeItemRow,
	depth: number,
	ctx: RecipeResolveCtx,
	agg: LineAggregate
): LineCost {
	const lineWarnings: LineWarning[] = [];
	const kind = (item.kind ?? 'free') as RecipeLineKind;
	const netQty = qtyToNumber(item.netQuantity);
	const wastePct = qtyToNumber(item.wastePct);
	const grossQty = netQty / wasteFactor(wastePct);
	const inherited = item.productId === null ? undefined : ctx.facts.get(item.productId);
	const ownAllergens = toAllergenList(item.allergens);
	const lineAllergens = ownAllergens.length > 0
		? ownAllergens
		: (inherited?.allergens ?? []);

	let unitRateUnits: number | null = null;
	let priceSource: PriceSource = 'none';
	let priceAsOf: string | null = null;
	let supplierName: string | null = null;
	let nutrition: NutritionTotals | null = null;

	const manualRate = toRate(item.unitCost);

	if (kind === 'recipe') {
		const priced = resolveRecipeLinePrice(item, depth, netQty, ctx, agg);
		lineWarnings.push(...priced.lineWarnings);
		unitRateUnits = priced.unitRateUnits;
		priceSource = priced.priceSource;
		nutrition = priced.nutrition;
	} else if (kind === 'product' && manualRate === null && item.productId !== null) {
		const priced = resolveProductLinePrice(item, ctx.prices);
		lineWarnings.push(...priced.lineWarnings);
		unitRateUnits = priced.unitRateUnits;
		priceSource = priced.priceSource;
		priceAsOf = priced.priceAsOf;
		supplierName = priced.supplierName;
	}

	if (unitRateUnits === null && manualRate !== null) {
		unitRateUnits = manualRate;
		priceSource = 'manual';
	}

	if (unitRateUnits === null) {
		lineWarnings.push('missing-price');
		agg.warnings.add('no-price');
	}

	const costCents = unitRateUnits === null ? 0 : lineCostCents(grossQty, unitRateUnits);

	if (kind !== 'recipe') {
		nutrition = computeOwnLineNutrition(item, inherited, netQty);
	}

	if (nutrition) {
		agg.nutritionTotal = addNutrition(agg.nutritionTotal, nutrition);
		agg.nutritionKnown += 1;
	} else {
		agg.nutritionPartial = true;
		lineWarnings.push('nutrition-skipped');
	}

	for (const code of lineAllergens) agg.allergens.add(code);

	return {
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
	};
}

function buildRecipeLines(
	node: RecipeNode,
	depth: number,
	ctx: RecipeResolveCtx
): { lines: LineCost[]; totalCostCents: number; agg: LineAggregate } {
	const agg: LineAggregate = {
		warnings: new Set<RecipeWarning>(),
		allergens: new Set<Allergen>(),
		childDepth: 0,
		nutritionTotal: emptyNutrition(),
		nutritionKnown: 0,
		nutritionPartial: false,
	};

	const lines: LineCost[] = [];
	let totalCostCents = 0;
	for (const item of node.items) {
		const line = computeRecipeLine(item, depth, ctx, agg);
		totalCostCents += line.costCents;
		lines.push(line);
	}

	for (const line of lines) {
		line.sharePct = totalCostCents > 0 ? (line.costCents / totalCostCents) * 100 : 0;
	}

	return { lines, totalCostCents, agg };
}

function finalizeRecipeCost(
	id: number,
	node: RecipeNode,
	lines: LineCost[],
	totalCostCents: number,
	agg: LineAggregate
): RecipeCost {
	const portions = Math.max(qtyToNumber(node.recipe.portions), 0) || 1;
	const totals = recipeTotals({
		totalCostCents,
		portions,
		sellingPrice: node.recipe.sellingPrice,
		vatPct: node.recipe.vatPct,
		targetFoodCostPct: node.recipe.targetFoodCostPct,
	});

	if (agg.nutritionPartial) agg.warnings.add('nutrition-partial');

	return {
		...totals,
		recipeId: id,
		kind: (node.recipe.kind ?? 'plato') as RecipeKind,
		portions,
		yieldQty: node.recipe.yieldQty === null ? null : qtyToNumber(node.recipe.yieldQty),
		yieldUnit: node.recipe.yieldUnit,
		lines,
		allergens: EU_ALLERGENS.filter((code) => agg.allergens.has(code)),
		nutritionTotal: agg.nutritionKnown > 0 ? agg.nutritionTotal : null,
		nutritionPerPortion:
			agg.nutritionKnown > 0 ? scaleNutrition(agg.nutritionTotal, 1 / portions) : null,
		nutritionPartial: agg.nutritionPartial,
		nutritionCoverage: { known: agg.nutritionKnown, total: lines.length },
		missingPriceCount: lines.filter((l) => l.warnings.includes('missing-price')).length,
		depth: agg.childDepth,
		warnings: [...agg.warnings],
	};
}

export function computeRecipeCosts(
	graph: Map<number, RecipeNode>,
	prices: Map<number, ResolvedPrice>,
	facts: Map<number, ProductFacts> = new Map()
): Map<number, RecipeCost> {
	const costs = new Map<number, RecipeCost>();
	const color = new Map<number, number>();

	function resolve(id: number, depth: number): RecipeCost | null {
		const cached = costs.get(id);
		if (cached) return cached;
		const node = graph.get(id);
		if (!node) return null;

		color.set(id, GREY);

		const ctx: RecipeResolveCtx = { graph, prices, facts, color, resolveNode: resolve };
		const { lines, totalCostCents, agg } = buildRecipeLines(node, depth, ctx);
		const out = finalizeRecipeCost(id, node, lines, totalCostCents, agg);

		color.set(id, BLACK);
		costs.set(id, out);
		return out;
	}

	for (const id of graph.keys()) {
		if ((color.get(id) ?? WHITE) === WHITE) resolve(id, 0);
	}
	return costs;
}

export function collectProductIds(graph: Map<number, RecipeNode>, pricedOnly: boolean): number[] {
	const ids: number[] = [];
	for (const node of graph.values()) {
		for (const item of node.items) {
			if (item.kind !== 'product' || item.productId === null) continue;
			if (pricedOnly && item.unitCost !== null) continue;
			ids.push(item.productId);
		}
	}
	return ids;
}

export async function recipeCosts(rid: string): Promise<Map<number, RecipeCost>> {
	const graph = await loadRecipeGraph(rid);
	const [prices, facts] = await Promise.all([
		resolveProductPrices(rid, collectProductIds(graph, true)),
		loadProductFacts(rid, collectProductIds(graph, false)),
	]);
	return computeRecipeCosts(graph, prices, facts);
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

function buildRecipeParentIndex(graph: Map<number, RecipeNode>): Map<number, number[]> {
	const parentsOf = new Map<number, number[]>();
	for (const [parentId, node] of graph) {
		for (const item of node.items) {
			if (item.childRecipeId === null) continue;
			const list = parentsOf.get(item.childRecipeId);
			if (list) list.push(parentId);
			else parentsOf.set(item.childRecipeId, [parentId]);
		}
	}
	return parentsOf;
}

export function recipeAncestors(graph: Map<number, RecipeNode>, id: number): Set<number> {
	const parentsOf = buildRecipeParentIndex(graph);

	const ancestors = new Set<number>();
	const queue = [id];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const parentId of parentsOf.get(current) ?? []) {
			if (ancestors.has(parentId)) continue;
			ancestors.add(parentId);
			queue.push(parentId);
		}
	}
	return ancestors;
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
	return db.$count(recipes, tdb.scope(recipes.restaurantId, sql`${recipes.status} <> 'archived'`));
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

export interface RecipeCostPoint {
	asOf: string;
	costPerPortionCents: number | null;
	foodCostPct: number | null;
}

export interface RecipeCostTrendPoint {
	asOf: string;
	pricedRecipes: number;
	avgFoodCostPct: number | null;
	avgCostPerPortionCents: number | null;
}

export interface RecipeCostTrend {
	points: RecipeCostTrendPoint[];
	perRecipe: Map<number, RecipeCostPoint[]>;
}

export function trendAsOfDates(today: string, months = 6): string[] {
	const dates: string[] = [];
	let month = monthOf(today);
	for (let i = 0; i < months; i++) {
		month = shiftMonth(month, -1);
		dates.unshift(monthBounds(month).rangeTo);
	}
	dates.push(today);
	return dates;
}

function averageOf(values: Array<number | null>): number | null {
	const present = values.filter((v): v is number => v !== null);
	return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

export async function recipeCostTrend(
	rid: string,
	graph: Map<number, RecipeNode>,
	today: string,
	months = 6
): Promise<RecipeCostTrend> {
	const productIds = collectProductIds(graph, true);
	const facts = await loadProductFacts(rid, collectProductIds(graph, false));
	const dates = trendAsOfDates(today, months);
	const perRecipe = new Map<number, RecipeCostPoint[]>();
	const points: RecipeCostTrendPoint[] = [];

	for (const asOf of dates) {
		const prices = await resolveProductPrices(rid, productIds, asOf === today ? null : asOf);
		const costs = computeRecipeCosts(graph, prices, facts);
		const foodCosts: Array<number | null> = [];
		const portionCosts: number[] = [];
		let priced = 0;
		for (const [recipeId, { recipe }] of graph) {
			if (recipe.kind !== 'plato') continue;
			const cost = costs.get(recipeId);
			const complete = cost !== undefined && cost.missingPriceCount === 0 && cost.lines.length > 0;
			const point: RecipeCostPoint = {
				asOf,
				costPerPortionCents: complete ? cost.costPerPortionCents : null,
				foodCostPct: complete ? cost.foodCostPct : null,
			};
			const series = perRecipe.get(recipeId) ?? [];
			series.push(point);
			perRecipe.set(recipeId, series);
			if (complete) {
				priced++;
				portionCosts.push(cost.costPerPortionCents);
				foodCosts.push(cost.foodCostPct);
			}
		}
		points.push({
			asOf,
			pricedRecipes: priced,
			avgFoodCostPct: averageOf(foodCosts),
			avgCostPerPortionCents: portionCosts.length ? Math.round(portionCosts.reduce((a, b) => a + b, 0) / portionCosts.length) : null,
		});
	}
	return { points, perRecipe };
}

export function costDeltaPct(series: RecipeCostPoint[] | undefined): number | null {
	if (!series || series.length < 2) return null;
	const current = series[series.length - 1]!.costPerPortionCents;
	const earlier = series.slice(0, -1).map((p) => p.costPerPortionCents).filter((v): v is number => v !== null && v > 0);
	if (current === null || earlier.length === 0) return null;
	const base = earlier[0]!;
	return Math.round(((current - base) / base) * 1000) / 10;
}
