import { eq } from 'drizzle-orm';
import { db, forTenant } from './db';
import { recipes } from './schema';
import { fmtEur } from '$lib/formatters';
import { moneyPlain, generatedStamp } from './reports/shared';
import { convertQty, fromRate, unitFamily, type Allergen } from '$lib/recipes';
import {
	collectProductIds, computeRecipeCosts, loadProductFacts, loadRecipeGraph, resolveProductPrices,
	type LineCost, type RecipeCost
} from './recipes';

export interface SheetKpi {
	labelKey: string;
	value: string;
}

export interface SheetLine {
	name: string;
	isPrep: boolean;
	childRecipeId: number | null;
	grossQty: string;
	wastePct: string;
	netQty: string;
	netLabel: string;
	unit: string;
	unitCost: string;
	amount: string;
	sharePct: string;
	sourceKey: string;
	sourceDate: string | null;
	supplier: string | null;
	allergens: Allergen[];
	warnings: string[];
}

export interface SheetPrep {
	name: string;
	yieldLabel: string;
	total: string;
	lines: SheetLine[];
}

export interface RecipeSheetDoc {
	id: number;
	name: string;
	kindKey: string;
	statusKey: string;
	sectionKey: string | null;
	portions: string;
	generatedAt: string;
	kpis: SheetKpi[];
	secondaryKpis: SheetKpi[];
	lines: SheetLine[];
	totalAmount: string;
	preps: SheetPrep[];
	steps: string[];
	allergens: Allergen[];
	nutrition: { kcal: string; protein: string; carbs: string; fat: string } | null;
	coverage: { known: number; total: number };
	summary: {
		costPerPortion: string;
		grossPrice: string;
		netPrice: string;
		foodCost: string;
		marginPct: string;
	};
	warnings: string[];
	csv: { filename: string; header: string[]; rows: (string | number | null)[][] };
}

const qty = (n: number) => {
	const rounded = Math.round(n * 10000) / 10000;
	return String(rounded).replace('.', ',');
};

const pct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`;

export function kitchenQty(netQty: number, unit: string | null): string {
	const family = unitFamily(unit);
	if (family === 'mass') {
		const grams = convertQty(netQty, unit, 'g');
		if (grams !== null) {
			return grams < 1000 ? `${qty(grams)} g` : `${qty(grams / 1000)} kg`;
		}
	}
	if (family === 'volume') {
		const ml = convertQty(netQty, unit, 'ml');
		if (ml !== null) {
			return ml < 1000 ? `${qty(ml)} ml` : `${qty(ml / 1000)} L`;
		}
	}
	return `${qty(netQty)} ${unit ?? ''}`.trim();
}

const eur = (cents: number | null) => (cents === null ? '—' : fmtEur(cents / 100));

function sheetLine(line: LineCost): SheetLine {
	return {
		name: line.name,
		isPrep: line.kind === 'recipe',
		childRecipeId: line.childRecipeId,
		grossQty: qty(line.grossQty),
		wastePct: line.wastePct === 0 ? '—' : pct(line.wastePct),
		netQty: qty(line.netQty),
		netLabel: kitchenQty(line.netQty, line.unit),
		unit: line.unit ?? '',
		unitCost: line.unitRateUnits === null ? '—' : fromRate(line.unitRateUnits).replace('.', ','),
		amount: eur(line.costCents),
		sharePct: pct(line.sharePct),
		sourceKey: `rec.src.${line.priceSource}`,
		sourceDate: line.priceAsOf,
		supplier: line.supplierName,
		allergens: line.allergens,
		warnings: line.warnings,
	};
}

function csvOf(name: string, cost: RecipeCost, lines: SheetLine[], now: Date) {
	const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'escandallo';

	const rows: (string | number | null)[][] = lines.map((l) => [
		l.name, l.grossQty, l.wastePct, l.netQty, l.unit, l.unitCost, l.amount, l.sharePct,
		l.allergens.join(' '),
	]);
	rows.push([]);
	rows.push(['Coste total', moneyPlain(cost.totalCostCents / 100)]);
	rows.push(['Raciones', String(cost.portions)]);
	rows.push(['Coste por racion', moneyPlain(cost.costPerPortionCents / 100)]);
	if (cost.netPriceCents !== null) rows.push(['PVP sin IVA', moneyPlain(cost.netPriceCents / 100)]);
	if (cost.grossPriceCents !== null) rows.push(['PVP con IVA', moneyPlain(cost.grossPriceCents / 100)]);
	if (cost.foodCostPct !== null) rows.push(['Food cost %', cost.foodCostPct.toFixed(1).replace('.', ',')]);
	if (cost.marginCents !== null) rows.push(['Margen bruto', moneyPlain(cost.marginCents / 100)]);

	return {
		filename: `escandallo-${slug}-${now.toISOString().slice(0, 10)}.csv`,
		header: [
			'Ingrediente', 'Bruto', 'Merma', 'Neto', 'Unidad', 'EUR/unidad', 'Importe',
			'% del total', 'Alergenos',
		],
		rows,
	};
}

export async function buildRecipeSheet(
	rid: string,
	id: number,
	now: Date
): Promise<RecipeSheetDoc | null> {
	const tdb = forTenant(rid);
	const [recipe] = await db.select().from(recipes)
		.where(tdb.scope(recipes.restaurantId, eq(recipes.id, id))).limit(1);
	if (!recipe) return null;

	const graph = await loadRecipeGraph(rid);
	const [prices, facts] = await Promise.all([
		resolveProductPrices(rid, collectProductIds(graph, true)),
		loadProductFacts(rid, collectProductIds(graph, false)),
	]);
	const costs = computeRecipeCosts(graph, prices, facts);
	const cost = costs.get(id);
	if (!cost) return null;

	const lines = cost.lines.map(sheetLine);

	const preps: SheetPrep[] = [];
	for (const line of cost.lines) {
		if (line.kind !== 'recipe' || line.childRecipeId === null) continue;
		if (preps.some((p) => p.name === line.name)) continue;
		const child = costs.get(line.childRecipeId);
		const childNode = graph.get(line.childRecipeId);
		if (!child || !childNode) continue;
		preps.push({
			name: childNode.recipe.name,
			yieldLabel: child.yieldQty === null
				? `${child.portions}`
				: `${qty(child.yieldQty)} ${child.yieldUnit ?? ''}`.trim(),
			total: eur(child.totalCostCents),
			lines: child.lines.map(sheetLine),
		});
	}

	return {
		id,
		name: recipe.name,
		kindKey: `rec.kind.${recipe.kind}`,
		statusKey: `rec.status.${recipe.status}`,
		sectionKey: recipe.section ? `rec.section.${recipe.section}` : null,
		portions: String(cost.portions),
		generatedAt: generatedStamp(now),
		kpis: [
			{ labelKey: 'rec.sum.totalCost', value: eur(cost.totalCostCents) },
			{ labelKey: 'rec.sum.costPerPortion', value: eur(cost.costPerPortionCents) },
			{ labelKey: 'rec.sum.grossPrice', value: eur(cost.grossPriceCents) },
			{ labelKey: 'rec.sum.foodCost', value: cost.foodCostPct === null ? '—' : pct(cost.foodCostPct) },
		],
		secondaryKpis: [
			{ labelKey: 'rec.sum.netPrice', value: eur(cost.netPriceCents) },
			{ labelKey: 'rec.sum.margin', value: eur(cost.marginCents) },
			{ labelKey: 'rec.sum.marginPct', value: cost.marginPct === null ? '—' : pct(cost.marginPct) },
			{ labelKey: 'rec.sum.suggested', value: eur(cost.suggestedGrossPriceCents) },
		],
		lines,
		totalAmount: eur(cost.totalCostCents),
		preps,
		steps: (recipe.preparation ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
		allergens: cost.allergens,
		nutrition: cost.nutritionPerPortion
			? {
				kcal: cost.nutritionPerPortion.kcal.toFixed(0),
				protein: `${cost.nutritionPerPortion.protein.toFixed(1)} g`,
				carbs: `${cost.nutritionPerPortion.carbs.toFixed(1)} g`,
				fat: `${cost.nutritionPerPortion.fat.toFixed(1)} g`,
			}
			: null,
		coverage: cost.nutritionCoverage,
		summary: {
			costPerPortion: eur(cost.costPerPortionCents),
			grossPrice: eur(cost.grossPriceCents),
			netPrice: eur(cost.netPriceCents),
			foodCost: cost.foodCostPct === null ? '—' : pct(cost.foodCostPct),
			marginPct: cost.marginPct === null ? '—' : pct(cost.marginPct),
		},
		warnings: cost.warnings,
		csv: csvOf(recipe.name, cost, lines, now),
	};
}
