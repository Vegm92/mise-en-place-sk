/**
 * Dashboard "Turno" derivations — the pure layer behind the desktop dashboard.
 *
 * Covers the four decisions the screen is built on:
 *   - euros at stake per work item, and the ranking that follows from it
 *   - the price-shock impact formula (spend-based, so it is unit-agnostic)
 *   - plan-to-date / run-rate forecast, per category and for the month
 *   - the cumulative pace curve fed to the chart
 */
import { describe, it, expect } from 'vitest';
import {
	buildWorklist, buildCategoryRisk, buildPaceCurve, sortWorklist,
	planToDate, forecastFromRunRate, priceShockImpact, atStake, elapsedFraction,
	MAX_WORK_ITEMS,
} from '../src/lib/dashboard-turno';
import type { TurnoInput } from '../src/lib/dashboard-turno';

function input(over: Partial<TurnoInput> = {}): TurnoInput {
	return {
		isCurrentMonth: true,
		daysElapsed: 15,
		daysInMonth: 30,
		monthSpend: 6000,
		projectedEom: 12000,
		totalBudget: 10000,
		budgets: {},
		categorySpend: {},
		priceShocks: [],
		payables: [],
		review: { count: 0, amount: 0 },
		missing: [],
		uncategorized: [],
		...over,
	};
}

describe('elapsed fraction and forecast', () => {
	it('prorates the plan by elapsed days in the current month', () => {
		expect(elapsedFraction(input())).toBe(0.5);
		expect(planToDate(10000, input())).toBe(5000);
	});

	it('treats a closed month as fully elapsed', () => {
		const past = input({ isCurrentMonth: false, daysElapsed: 0 });
		expect(elapsedFraction(past)).toBe(1);
		expect(forecastFromRunRate(4000, past)).toBe(4000);
	});

	it('projects the month at the run rate to date', () => {
		expect(forecastFromRunRate(6000, input())).toBe(12000);
	});
});

describe('price shock impact', () => {
	it('charges only the extra euros paid at the new price', () => {
		expect(priceShockImpact({ deviationPct: 25, monthSpend: 500 })).toBeCloseTo(100, 6);
	});

	it('ignores price drops', () => {
		expect(priceShockImpact({ deviationPct: -20, monthSpend: 500 })).toBe(0);
	});

	it('is zero when the product has not been bought this month', () => {
		expect(priceShockImpact({ deviationPct: 25, monthSpend: 0 })).toBe(0);
	});
});

describe('category risk', () => {
	const risky = input({
		budgets: { Pescado: 4000, Carne: 6000 },
		categorySpend: { Pescado: 2600, Carne: 2400 },
	});

	it('ranks categories by forecast overrun, worst first', () => {
		const risk = buildCategoryRisk(risky);
		expect(risk.map(r => r.category)).toEqual(['Pescado', 'Carne']);
		expect(risk[0]!.forecast).toBe(5200);
		expect(risk[0]!.overrun).toBe(1200);
		expect(risk[1]!.overrun).toBe(-1200);
	});

	it('carries a plan-to-date so no bar stands without a reference', () => {
		expect(buildCategoryRisk(risky)[0]!.planToDate).toBe(2000);
	});

	it('skips categories with no budget set', () => {
		expect(buildCategoryRisk(input({ budgets: { Pescado: 0 }, categorySpend: { Pescado: 900 } }))).toEqual([]);
	});
});

describe('worklist', () => {
	const busy = input({
		budgets: { Pescado: 4000 },
		categorySpend: { Pescado: 2600 },
		priceShocks: [
			{ id: 1, ingredient: 'Merluza', supplier: 'Atlántico', oldPrice: 16, newPrice: 20, deviationPct: 25, monthSpend: 500, daysAgo: 0 },
			{ id: 2, ingredient: 'Tomate', supplier: 'Mercavera', oldPrice: 2.4, newPrice: 2.1, deviationPct: -12.5, monthSpend: 400, daysAgo: 1 },
		],
		payables: [
			{ id: 10, supplier_name: 'Atlántico', invoice_number: 'PA-1', due_date: '2026-05-01', amount: 300, days_delta: -4 },
			{ id: 11, supplier_name: 'Ibérico', invoice_number: 'CI-9', due_date: '2026-05-26', amount: 620, days_delta: 7 },
		],
		review: { count: 2, amount: 1090 },
		missing: [{ supplier_name: 'Panadería Ruiz', days_late: 9, frequency: 'weekly' }],
		uncategorized: [{ supplierId: 5, supplierName: 'Distribuciones Olé' }],
	});

	it('ranks by euros at stake and puts money-less items last', () => {
		const items = buildWorklist(busy);
		expect(items.map(i => i.kind)).toEqual(['budget', 'review', 'due', 'due', 'price', 'missing']);
		expect(items.map(i => i.eur > 0)).toEqual([true, true, true, true, true, false]);
	});

	it('takes its colour cue from severity, not from the kind of work', () => {
		const bySeverity = Object.fromEntries(buildWorklist(busy).map(i => [i.id, i.severity]));
		expect(bySeverity['due-overdue']).toBe('high');
		expect(bySeverity['price-1']).toBe('high');
		expect(bySeverity['budget-Pescado']).toBe('med');
		expect(bySeverity['due-11']).toBe('low');
		expect(bySeverity['review']).toBe('low');
		expect(bySeverity['missing-Panadería Ruiz']).toBe('med');
	});

	it('raises a budget item to high severity once the category is actually over', () => {
		const blown = input({
			budgets: { Pescado: 4000 },
			categorySpend: { Pescado: 4300 },
		});
		expect(buildWorklist(blown)[0]!.severity).toBe('high');
	});

	it('never lists more than the screen holds', () => {
		expect(buildWorklist(busy).length).toBeLessThanOrEqual(MAX_WORK_ITEMS);
	});

	it('drops price shocks that are price drops', () => {
		expect(buildWorklist(busy).some(i => i.id === 'price-2')).toBe(false);
	});

	it('groups overdue payables into one item carrying the total', () => {
		const overdue = buildWorklist(busy).find(i => i.id === 'due-overdue');
		expect(overdue?.eur).toBe(300);
		expect(overdue?.titleKey).toBe('turno.due.overdueTitle.one');
	});

	it('sums the euros on the table', () => {
		expect(atStake(buildWorklist(busy))).toBeCloseTo(1200 + 1090 + 620 + 300 + 100, 6);
	});

	it('resorts by urgency without changing the set', () => {
		const items = buildWorklist(busy);
		const urgent = sortWorklist(items, 'urgency');
		expect(urgent[0]!.id).toBe('due-overdue');
		expect(urgent.map(i => i.id).sort()).toEqual(items.map(i => i.id).sort());
	});

	it('is empty when nothing needs a decision', () => {
		expect(buildWorklist(input())).toEqual([]);
	});

	it('raises no budget item for a closed month', () => {
		const past = input({
			isCurrentMonth: false,
			budgets: { Pescado: 4000 },
			categorySpend: { Pescado: 5200 },
		});
		expect(buildWorklist(past).some(i => i.kind === 'budget')).toBe(false);
	});

	it('names the frequency it expected from a silent supplier', () => {
		const item = buildWorklist(input({ missing: [{ supplier_name: 'Ruiz', days_late: 9, frequency: 'weekly' }] }))[0];
		expect(item?.whyKey).toBe('turno.missing.why.weekly');
	});

	it('falls back to a generic cadence for an unknown frequency', () => {
		const item = buildWorklist(input({ missing: [{ supplier_name: 'Ruiz', days_late: 9, frequency: 'lunar' }] }))[0];
		expect(item?.whyKey).toBe('turno.missing.why.periodic');
	});
});

describe('pace curve', () => {
	const spark = [100, 200, 300, 400, 0, 0];
	const curve = buildPaceCurve(spark, {
		isCurrentMonth: true, daysElapsed: 4, daysInMonth: 6, monthSpend: 1000, totalBudget: 1200,
	});

	it('accumulates actual spend up to today and stops', () => {
		expect(curve.map(p => p.actual)).toEqual([100, 300, 600, 1000, null, null]);
	});

	it('draws the plan as a straight line to the month cap', () => {
		expect(curve.at(-1)!.plan).toBe(1200);
		expect(curve[2]!.plan).toBe(600);
	});

	it('continues from today at the run rate to date', () => {
		expect(curve[3]!.forecast).toBe(1000);
		expect(curve.at(-1)!.forecast).toBe(1500);
	});

	it('omits the plan line when no budget is set', () => {
		const noBudget = buildPaceCurve(spark, {
			isCurrentMonth: true, daysElapsed: 4, daysInMonth: 6, monthSpend: 1000, totalBudget: 0,
		});
		expect(noBudget.every(p => p.plan === null)).toBe(true);
	});

	it('has no forecast for a closed month', () => {
		const past = buildPaceCurve(spark, {
			isCurrentMonth: false, daysElapsed: 0, daysInMonth: 6, monthSpend: 1000, totalBudget: 1200,
		});
		expect(past.every(p => p.forecast === null)).toBe(true);
		expect(past.at(-1)!.actual).toBe(1000);
	});
});
