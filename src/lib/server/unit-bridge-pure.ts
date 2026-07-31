import { normalizeProductKey, canonicalizeUnit } from './normalize';

export function conversionKey(ingredient: string, purchaseUnit: string): string {
	return `${normalizeProductKey(ingredient)}::${normalizeProductKey(purchaseUnit)}`;
}

export function resolveUnitFromMap(
	conversionMap: Map<string, { canonicalUnit: string; conversionFactor: number }>,
	description: string,
	unit: string,
): { canonicalUnit: string; conversionFactor: number } | null {
	const rule = conversionMap.get(conversionKey(description, unit));
	if (rule) return rule;
	const canonical = canonicalizeUnit(unit);
	if (canonical) return { canonicalUnit: canonical, conversionFactor: 1 };
	return null;
}
