import { describe, it, expect } from 'vitest';
import { resolveUnitFromMap, conversionKey } from '../src/lib/server/unit-bridge-pure';

// Mirrors loadConversionMap: rules are keyed by the normalized ingredient+unit.
const makeMap = (entries: Array<{ ingredient: string; purchaseUnit: string; canonicalUnit: string; conversionFactor: number }>) => {
	const map = new Map<string, { canonicalUnit: string; conversionFactor: number }>();
	for (const e of entries) {
		map.set(conversionKey(e.ingredient, e.purchaseUnit), { canonicalUnit: e.canonicalUnit, conversionFactor: e.conversionFactor });
	}
	return map;
};

describe('resolveUnitFromMap — id-resolved path (rule in map)', () => {
	it('returns the conversion rule when description+unit match', () => {
		const map = makeMap([{ ingredient: 'Olive Oil', purchaseUnit: 'tin', canonicalUnit: 'L', conversionFactor: 5 }]);
		const result = resolveUnitFromMap(map, 'Olive Oil', 'tin');
		expect(result).toEqual({ canonicalUnit: 'L', conversionFactor: 5 });
	});

	it('matches rules regardless of casing and accents (issue #296)', () => {
		const map = makeMap([{ ingredient: 'Aceite Girasol', purchaseUnit: 'Garrafón', conversionFactor: 25, canonicalUnit: 'L' }]);
		expect(resolveUnitFromMap(map, 'ACEITE  GIRASOL', 'garrafon')).toEqual({ canonicalUnit: 'L', conversionFactor: 25 });
	});

	it('returns null when description is not in the map', () => {
		const map = makeMap([{ ingredient: 'Olive Oil', purchaseUnit: 'tin', canonicalUnit: 'L', conversionFactor: 5 }]);
		expect(resolveUnitFromMap(map, 'Butter', 'tin')).toBeNull();
	});

	it('returns null when unit does not match', () => {
		const map = makeMap([{ ingredient: 'Olive Oil', purchaseUnit: 'tin', canonicalUnit: 'L', conversionFactor: 5 }]);
		expect(resolveUnitFromMap(map, 'Olive Oil', 'drum')).toBeNull();
	});

	it('distinguishes rules by purchaseUnit for the same ingredient', () => {
		const map = makeMap([
			{ ingredient: 'Salt', purchaseUnit: 'bag', canonicalUnit: 'kg', conversionFactor: 25 },
			{ ingredient: 'Salt', purchaseUnit: 'box', canonicalUnit: 'kg', conversionFactor: 1 },
		]);
		expect(resolveUnitFromMap(map, 'Salt', 'bag')).toEqual({ canonicalUnit: 'kg', conversionFactor: 25 });
		expect(resolveUnitFromMap(map, 'Salt', 'box')).toEqual({ canonicalUnit: 'kg', conversionFactor: 1 });
	});
});

describe('resolveUnitFromMap — name-fallback path (unit already canonical)', () => {
	it('returns pass-through for kg when map is empty', () => {
		const map = new Map();
		expect(resolveUnitFromMap(map, 'Flour', 'kg')).toEqual({ canonicalUnit: 'kg', conversionFactor: 1 });
	});

	it('resolves every synonym spelling to its canonical unit', () => {
		const cases: Array<[string, string]> = [
			['kg', 'kg'], ['Kg', 'kg'], ['KILOS', 'kg'], ['kilogramos', 'kg'],
			['g', 'g'], ['gr', 'g'], ['grs', 'g'], ['mg', 'mg'],
			['l', 'L'], ['L', 'L'], ['Lt', 'L'], ['litros', 'L'], ['ml', 'ml'], ['mL', 'ml'],
			['ud', 'ud'], ['uds', 'ud'], ['un', 'ud'], ['unidad', 'ud'], ['Unidades', 'ud'],
			['pz', 'pieza'], ['pza', 'pieza'], ['pieza', 'pieza'], ['piezas', 'pieza'],
			['caja', 'caja'], ['cajas', 'caja'], ['bote', 'bote'], ['botes', 'bote'],
			['bolsa', 'bolsa'], ['bolsas', 'bolsa'], ['sobre', 'sobre'], ['sobres', 'sobre'],
			['lata', 'lata'], ['latas', 'lata'], ['botella', 'botella'], ['botellas', 'botella'],
			['garrafa', 'garrafa'], ['saco', 'saco'], ['bandeja', 'bandeja'], ['docena', 'docena'],
		];
		const map = new Map();
		for (const [unit, canonical] of cases) {
			const result = resolveUnitFromMap(map, 'SomeItem', unit);
			expect(result, `expected '${unit}' → '${canonical}'`).toEqual({ canonicalUnit: canonical, conversionFactor: 1 });
		}
	});

	it('returns null for unknown non-canonical unit not in map', () => {
		const map = new Map();
		expect(resolveUnitFromMap(map, 'Cheese', 'wedge')).toBeNull();
	});

	it('trims whitespace from unit when checking canonical set', () => {
		const map = new Map();
		expect(resolveUnitFromMap(map, 'Milk', '  kg  ')).toEqual({ canonicalUnit: 'kg', conversionFactor: 1 });
	});
});

describe('resolveUnitFromMap — map rule takes precedence over canonical check', () => {
	it('returns the rule from the map even when unit happens to be canonical', () => {
		// A rule overriding kg→kg with a non-1 factor would be odd but allowed.
		const map = makeMap([{ ingredient: 'Flour', purchaseUnit: 'kg', canonicalUnit: 'g', conversionFactor: 1000 }]);
		expect(resolveUnitFromMap(map, 'Flour', 'kg')).toEqual({ canonicalUnit: 'g', conversionFactor: 1000 });
	});

	it('a rule saved with different casing still beats the canonical fallback', () => {
		const map = makeMap([{ ingredient: 'Harina 00', purchaseUnit: 'Saco', canonicalUnit: 'kg', conversionFactor: 25 }]);
		expect(resolveUnitFromMap(map, 'HARINA 00', 'saco')).toEqual({ canonicalUnit: 'kg', conversionFactor: 25 });
	});
});
