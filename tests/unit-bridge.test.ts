import { describe, it, expect } from 'vitest';
import { resolveUnitFromMap } from '../src/lib/server/unit-bridge-pure';

const makeMap = (entries: Array<{ ingredient: string; purchaseUnit: string; canonicalUnit: string; conversionFactor: number }>) => {
	const map = new Map<string, { canonicalUnit: string; conversionFactor: number }>();
	for (const e of entries) {
		map.set(`${e.ingredient}::${e.purchaseUnit}`, { canonicalUnit: e.canonicalUnit, conversionFactor: e.conversionFactor });
	}
	return map;
};

describe('resolveUnitFromMap — id-resolved path (rule in map)', () => {
	it('returns the conversion rule when description+unit match', () => {
		const map = makeMap([{ ingredient: 'Olive Oil', purchaseUnit: 'tin', canonicalUnit: 'L', conversionFactor: 5 }]);
		const result = resolveUnitFromMap(map, 'Olive Oil', 'tin');
		expect(result).toEqual({ canonicalUnit: 'L', conversionFactor: 5 });
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

	it('returns pass-through for all canonical units', () => {
		const canonicals = ['kg', 'g', 'mg', 'L', 'l', 'ml', 'mL', 'ud', 'uds', 'un', 'unidad', 'unidades',
			'pz', 'pza', 'pieza', 'piezas', 'caja', 'cajas', 'bote', 'botes', 'bolsa', 'bolsas',
			'sobre', 'sobres', 'lata', 'latas', 'botella', 'botellas'];
		const map = new Map();
		for (const unit of canonicals) {
			const result = resolveUnitFromMap(map, 'SomeItem', unit);
			expect(result, `expected pass-through for canonical unit '${unit}'`).toEqual({ canonicalUnit: unit, conversionFactor: 1 });
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
});
