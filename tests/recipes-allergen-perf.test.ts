import { describe, test, expect } from 'vitest';
import {
	toAllergenList,
	isAllergen,
	isRecipeKind,
	isRecipeStatus,
	isRecipeLineKind,
	isRecipeSection,
} from '../src/lib/recipes';

describe('recipes allergen and type-guard performance and correctness', () => {
	test('correctly validates recipe kinds, statuses, line kinds, sections, and allergens', () => {
		expect(isRecipeKind('plato')).toBe(true);
		expect(isRecipeKind('invalid')).toBe(false);

		expect(isRecipeStatus('active')).toBe(true);
		expect(isRecipeStatus('unknown')).toBe(false);

		expect(isRecipeLineKind('product')).toBe(true);
		expect(isRecipeLineKind('other')).toBe(false);

		expect(isRecipeSection('entrantes')).toBe(true);
		expect(isRecipeSection('nonexistent')).toBe(false);

		expect(isAllergen('gluten')).toBe(true);
		expect(isAllergen('peanut')).toBe(false);

		expect(toAllergenList(['moluscos', 'gluten', 'gluten', 'unicornio'])).toEqual(['gluten', 'moluscos']);
		expect(toAllergenList([])).toEqual([]);
		expect(toAllergenList(null)).toEqual([]);
	});

	test('benchmarks toAllergenList and type-guard performance', () => {
		const sampleInputs = [
			['gluten', 'lacteos', 'unknown', 'pescado'],
			['nothing', 'invalid', 'foo'],
			['soja', 'apio', 'sesamo', 'altramuces', 'gluten', 'huevos'],
			['gluten'],
			[],
		];

		const kinds = ['plato', 'elaboracion', 'invalid', 'plato', 'unknown'];
		const statuses = ['draft', 'active', 'archived', 'deleted', 'active'];

		const iterations = 500000;
		const start = performance.now();

		for (let i = 0; i < iterations; i++) {
			const inp = sampleInputs[i % sampleInputs.length]!;
			toAllergenList(inp);
			isRecipeKind(kinds[i % kinds.length]);
			isRecipeStatus(statuses[i % statuses.length]);
			isAllergen('gluten');
		}

		const elapsed = performance.now() - start;
		console.log(`recipes allergen & type-guard benchmark (${iterations} iterations): ${elapsed.toFixed(2)} ms`);
		expect(elapsed).toBeGreaterThan(0);
	});
});
