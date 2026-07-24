/** Pure unit-bridge helpers — no DB import, safe to test in isolation. */

import { normalizeProductKey, canonicalizeUnit } from './normalize';

/**
 * Key under which a conversion rule is stored/looked up. Normalized on both
 * sides (issue #296) so "ACEITE GIRASOL" + "Garrafa" hits a rule saved as
 * "Aceite girasol" + "garrafa".
 */
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
	// No tenant rule — pass through any recognized spelling of a canonical
	// unit ("Kgs", "KILO", UN/ECE "KGM" → kg) with factor 1.
	const canonical = canonicalizeUnit(unit);
	if (canonical) return { canonicalUnit: canonical, conversionFactor: 1 };
	return null;
}
