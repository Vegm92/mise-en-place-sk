/** Pure unit-bridge helpers — no DB import, safe to test in isolation. */

export const CANONICAL_UNITS = new Set([
	'kg', 'g', 'mg',
	'L', 'l', 'ml', 'mL',
	'ud', 'uds', 'un', 'unidad', 'unidades',
	'pz', 'pza', 'pieza', 'piezas',
	'caja', 'cajas', 'bote', 'botes', 'bolsa', 'bolsas',
	'sobre', 'sobres', 'lata', 'latas', 'botella', 'botellas',
]);

export function resolveUnitFromMap(
	conversionMap: Map<string, { canonicalUnit: string; conversionFactor: number }>,
	description: string,
	unit: string,
): { canonicalUnit: string; conversionFactor: number } | null {
	const rule = conversionMap.get(`${description}::${unit}`);
	if (rule) return rule;
	if (CANONICAL_UNITS.has(unit.trim())) {
		return { canonicalUnit: unit.trim(), conversionFactor: 1 };
	}
	return null;
}
