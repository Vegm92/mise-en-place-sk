import { percentToFraction } from './tax';
import { toCents, type MoneyInput } from './money';

export const RECIPE_KINDS = ['plato', 'elaboracion'] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number];

export const RECIPE_STATUSES = ['draft', 'active', 'archived'] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

export const RECIPE_LINE_KINDS = ['free', 'product', 'recipe'] as const;
export type RecipeLineKind = (typeof RECIPE_LINE_KINDS)[number];

export const RECIPE_SECTIONS = [
	'entrantes', 'principales', 'postres', 'guarniciones', 'bebidas', 'otros'
] as const;
export type RecipeSection = (typeof RECIPE_SECTIONS)[number];

export const RECIPE_UNITS = ['kg', 'g', 'L', 'ml', 'ud'] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

export const EU_ALLERGENS = [
	'gluten', 'crustaceos', 'huevos', 'pescado', 'cacahuetes', 'soja', 'lacteos',
	'frutos_cascara', 'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces', 'moluscos'
] as const;
export type Allergen = (typeof EU_ALLERGENS)[number];

export const RATE_SCALE = 10_000;

export const DEFAULT_VAT_PCT = '10.00';
export const DEFAULT_TARGET_FOOD_COST_PCT = 30;

export const RECIPE_WARNINGS = ['cycle', 'no-price', 'nutrition-partial'] as const;
export type RecipeWarning = (typeof RECIPE_WARNINGS)[number];

export const SHEET_WARN_KEY: Record<RecipeWarning, string | null> = {
	cycle: 'rec.warn.sheet.cycle',
	'no-price': 'rec.warn.sheet.no-price',
	'nutrition-partial': null,
};

export type UnitFamily = 'mass' | 'volume' | 'count';

const UNIT_FACTORS: Record<string, { family: UnitFamily; factor: number }> = {
	mg:     { family: 'mass',   factor: 0.001 },
	g:      { family: 'mass',   factor: 1 },
	kg:     { family: 'mass',   factor: 1000 },
	ml:     { family: 'volume', factor: 1 },
	cl:     { family: 'volume', factor: 10 },
	l:      { family: 'volume', factor: 1000 },
	ud:     { family: 'count',  factor: 1 },
	pieza:  { family: 'count',  factor: 1 },
	docena: { family: 'count',  factor: 12 },
};

const QTY_INPUT = /^(\d+)(?:[.,](\d+))?$/;

export function isRecipeKind(v: unknown): v is RecipeKind {
	return typeof v === 'string' && (RECIPE_KINDS as readonly string[]).includes(v);
}

export function isRecipeStatus(v: unknown): v is RecipeStatus {
	return typeof v === 'string' && (RECIPE_STATUSES as readonly string[]).includes(v);
}

export function isRecipeLineKind(v: unknown): v is RecipeLineKind {
	return typeof v === 'string' && (RECIPE_LINE_KINDS as readonly string[]).includes(v);
}

export function isRecipeSection(v: unknown): v is RecipeSection {
	return typeof v === 'string' && (RECIPE_SECTIONS as readonly string[]).includes(v);
}

export function isAllergen(v: unknown): v is Allergen {
	return typeof v === 'string' && (EU_ALLERGENS as readonly string[]).includes(v);
}

export function toAllergenList(raw: unknown): Allergen[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<Allergen>();
	for (const entry of raw) if (isAllergen(entry)) seen.add(entry);
	return EU_ALLERGENS.filter((code) => seen.has(code));
}

export function unitKey(unit: string | null | undefined): string | null {
	if (!unit) return null;
	const key = String(unit).trim().toLowerCase();
	return key in UNIT_FACTORS ? key : null;
}

export function unitFamily(unit: string | null | undefined): UnitFamily | null {
	const key = unitKey(unit);
	return key ? UNIT_FACTORS[key].family : null;
}

export function convertQty(qty: number, from: string | null, to: string | null): number | null {
	if (!Number.isFinite(qty)) return null;
	const a = unitKey(from);
	const b = unitKey(to);
	if (!a || !b) return null;
	const fa = UNIT_FACTORS[a];
	const fb = UNIT_FACTORS[b];
	if (fa.family !== fb.family) return null;
	return (qty * fa.factor) / fb.factor;
}

const MAX_RAW_INT_DIGITS = 32;

function roundDecimalString(
	intPart: string,
	fracPart: string,
	scale: number,
	maxIntDigits: number
): string | null {
	if (intPart.length > MAX_RAW_INT_DIGITS) return null;
	const padded = (fracPart + '0'.repeat(scale + 1)).slice(0, scale + 1);
	const kept = padded.slice(0, scale);
	const roundUp = Number(padded[scale] ?? '0') >= 5;
	let units = BigInt(intPart) * 10n ** BigInt(scale) + BigInt(kept || '0');
	if (roundUp) units += 1n;
	const digits = units.toString().padStart(scale + 1, '0');
	const wholePart = digits.slice(0, digits.length - scale) || '0';
	const fracDigits = scale > 0 ? digits.slice(digits.length - scale) : '';
	if (wholePart.length > maxIntDigits) return null;
	return scale > 0 ? `${wholePart}.${fracDigits}` : wholePart;
}

export function parseQty(raw: MoneyInput, maxIntDigits = 15): string | null {
	if (raw === null || raw === undefined) return null;
	const text = String(raw).trim();
	if (text === '') return null;
	const m = QTY_INPUT.exec(text);
	if (!m) return null;
	const [, intPart, fracPart = ''] = m;
	const value = roundDecimalString(intPart, fracPart, 4, maxIntDigits);
	return value !== null && Number(value) > 0 ? value : null;
}

export function parseDecimal(raw: MoneyInput, scale = 2, maxIntDigits = 15): string | null {
	if (raw === null || raw === undefined) return null;
	const text = String(raw).trim();
	if (text === '') return null;
	const m = QTY_INPUT.exec(text);
	if (!m) return null;
	const [, intPart, fracPart = ''] = m;
	return roundDecimalString(intPart, fracPart, scale, maxIntDigits);
}

export function parsePercent(raw: MoneyInput, max: number): string | null {
	const parsed = parseDecimal(raw, 2);
	if (parsed === null) return null;
	const n = Number(parsed);
	return n >= 0 && n <= max ? parsed : null;
}

export function qtyToNumber(raw: MoneyInput): number {
	if (raw === null || raw === undefined) return 0;
	const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
	return Number.isFinite(n) ? n : 0;
}

export function toRate(value: MoneyInput): number | null {
	const parsed = parseDecimal(value, 4);
	if (parsed === null) return null;
	const [intPart, fracPart] = parsed.split('.');
	return Number(intPart) * RATE_SCALE + Number(fracPart);
}

export function fromRate(units: number): string {
	const rounded = Math.round(units);
	const intPart = Math.floor(rounded / RATE_SCALE);
	const frac = String(rounded % RATE_SCALE).padStart(4, '0');
	return `${intPart}.${frac}`;
}

export function rateFromCents(cents: number): number {
	return cents * (RATE_SCALE / 100);
}

export function wasteFactor(wastePct: MoneyInput): number {
	const pct = qtyToNumber(wastePct);
	if (!Number.isFinite(pct) || pct <= 0) return 1;
	if (pct >= 100) return 1;
	return 1 - pct / 100;
}

export function grossFromNet(netQty: number, wastePct: MoneyInput): number {
	return netQty / wasteFactor(wastePct);
}

export function netFromGross(grossQty: number, wastePct: MoneyInput): number {
	return grossQty * wasteFactor(wastePct);
}

export function lineCostCents(grossQty: number, rateUnits: number): number {
	if (!Number.isFinite(grossQty) || !Number.isFinite(rateUnits)) return 0;
	return Math.round((grossQty * rateUnits) / 100);
}

export interface NutritionTotals {
	kcal: number;
	protein: number;
	carbs: number;
	fat: number;
}

export interface NutritionPer100 {
	kcal100: number | null;
	protein100: number | null;
	carbs100: number | null;
	fat100: number | null;
}

export function emptyNutrition(): NutritionTotals {
	return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

export function addNutrition(a: NutritionTotals, b: NutritionTotals): NutritionTotals {
	return {
		kcal:    a.kcal + b.kcal,
		protein: a.protein + b.protein,
		carbs:   a.carbs + b.carbs,
		fat:     a.fat + b.fat,
	};
}

export function scaleNutrition(n: NutritionTotals, factor: number): NutritionTotals {
	return {
		kcal:    n.kcal * factor,
		protein: n.protein * factor,
		carbs:   n.carbs * factor,
		fat:     n.fat * factor,
	};
}

function nutritionHundreds(netQty: number, unit: string | null): number | null {
	const family = unitFamily(unit);
	if (family === 'mass') {
		const grams = convertQty(netQty, unit, 'g');
		return grams === null ? null : grams / 100;
	}
	if (family === 'volume') {
		const ml = convertQty(netQty, unit, 'ml');
		return ml === null ? null : ml / 100;
	}
	return null;
}

export function lineNutrition(
	netQty: number,
	unit: string | null,
	per100: NutritionPer100
): NutritionTotals | null {
	const hundreds = nutritionHundreds(netQty, unit);
	if (hundreds === null) return null;
	const { kcal100, protein100, carbs100, fat100 } = per100;
	if (kcal100 === null && protein100 === null && carbs100 === null && fat100 === null) return null;
	return {
		kcal:    (kcal100 ?? 0) * hundreds,
		protein: (protein100 ?? 0) * hundreds,
		carbs:   (carbs100 ?? 0) * hundreds,
		fat:     (fat100 ?? 0) * hundreds,
	};
}

export interface RecipeTotalsInput {
	totalCostCents: number;
	portions: number;
	sellingPrice: MoneyInput;
	vatPct: MoneyInput;
	targetFoodCostPct: MoneyInput;
}

export interface RecipeTotals {
	totalCostCents: number;
	costPerPortionCents: number;
	grossPriceCents: number | null;
	netPriceCents: number | null;
	foodCostPct: number | null;
	marginCents: number | null;
	marginPct: number | null;
	suggestedNetPriceCents: number | null;
	suggestedGrossPriceCents: number | null;
}

export function recipeTotals(input: RecipeTotalsInput): RecipeTotals {
	const { totalCostCents } = input;
	const portions = input.portions > 0 ? input.portions : 1;
	const costPerPortionCents = Math.round(totalCostCents / portions);

	const vatFraction = percentToFraction(input.vatPct) ?? 0;
	const grossPriceCents = toCents(input.sellingPrice);
	const netPriceCents =
		grossPriceCents === null ? null : Math.round(grossPriceCents / (1 + vatFraction));

	const hasPrice = netPriceCents !== null && netPriceCents > 0;
	const foodCostPct = hasPrice ? (costPerPortionCents / netPriceCents!) * 100 : null;
	const marginCents = hasPrice ? netPriceCents! - costPerPortionCents : null;
	const marginPct = foodCostPct === null ? null : 100 - foodCostPct;

	const targetPct = qtyToNumber(input.targetFoodCostPct);
	const hasTarget = targetPct > 0 && targetPct <= 100;
	const suggestedNetPriceCents = hasTarget
		? Math.round(costPerPortionCents / (targetPct / 100))
		: null;
	const suggestedGrossPriceCents =
		suggestedNetPriceCents === null
			? null
			: Math.round(suggestedNetPriceCents * (1 + vatFraction));

	return {
		totalCostCents,
		costPerPortionCents,
		grossPriceCents,
		netPriceCents,
		foodCostPct,
		marginCents,
		marginPct,
		suggestedNetPriceCents,
		suggestedGrossPriceCents,
	};
}
