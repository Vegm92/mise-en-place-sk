import { describe, test, expect } from 'vitest';
import {
	buildWorklist,
	buildCategoryRisk,
	buildPaceCurve,
	sortWorklist,
	atStake,
	type TurnoInput,
} from '../src/lib/dashboard-turno';

describe('dashboard-turno performance and correctness', () => {
	const sampleInput: TurnoInput = {
		isCurrentMonth: true,
		daysElapsed: 15,
		daysInMonth: 30,
		monthSpend: 6000,
		projectedEom: 12000,
		totalBudget: 10000,
		budgets: { Pescado: 4000, Carne: 6000, Verdura: 2000, Bebidas: 3000, Limpieza: 1000 },
		categorySpend: { Pescado: 2600, Carne: 2400, Verdura: 1500, Bebidas: 1000, Limpieza: 400 },
		priceShocks: Array.from({ length: 50 }, (_, i) => ({
			id: i,
			ingredient: `Ingredient ${i}`,
			supplier: `Supplier ${i}`,
			oldPrice: 10,
			newPrice: 15,
			deviationPct: 50,
			extraPaid: 100 + i,
			daysAgo: i % 5,
		})),
		review: { count: 5, amount: 2000, incidencias: 1 },
		missing: Array.from({ length: 20 }, (_, i) => ({
			supplier_name: `Supplier ${i}`,
			days_late: i + 1,
			frequency: 'weekly',
		})),
		uncategorized: [{ supplierId: 100, supplierName: 'Uncat Supplier' }],
	};

	const sparkData = Array.from({ length: 30 }, (_, i) => 200);

	test('verifies correctness of single-pass buildWorklist and buildCategoryRisk', () => {
		const worklist = buildWorklist(sampleInput);
		expect(worklist.length).toBeLessThanOrEqual(6);
		expect(worklist[0]!.kind).toBe('review');
		expect(worklist[0]!.eur).toBe(2000);
		expect(worklist[1]!.kind).toBe('budget');
		expect(worklist[1]!.eur).toBe(1200);

		const risks = buildCategoryRisk(sampleInput);
		expect(risks[0]!.category).toBe('Pescado');
		expect(risks[0]!.overrun).toBe(1200);

		const pace = buildPaceCurve(sparkData, sampleInput);
		expect(pace).toHaveLength(30);

		const stake = atStake(worklist);
		expect(stake).toBeGreaterThan(0);

		const reSorted = sortWorklist(worklist, 'urgency');
		expect(reSorted).toHaveLength(worklist.length);
	});

	test('benchmarks buildWorklist performance', () => {
		const iterations = 10000;
		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			buildWorklist(sampleInput);
		}
		const elapsed = performance.now() - start;
		console.log(`buildWorklist benchmark (${iterations} ops): ${elapsed.toFixed(2)} ms`);
		expect(elapsed).toBeGreaterThan(0);
	});
});
