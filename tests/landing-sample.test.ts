/**
 * The landing's "example with sample data" card (src/lib/landing-sample.ts →
 * src/lib/server/landing-facts.ts → SampleProof.svelte).
 *
 * The figures on that card are not typed into the copy: the fixture
 * deliveries are run through the app's own deviation engine
 * (`computePriceDeviations`, src/lib/server/price-deviations.ts, ADR-039) and
 * the card renders whatever it returns. These tests pin that wiring — so the
 * card can only ever show what the real alert logic would show for those
 * lines — and pin the fixture's story (one supplier raises one product a few
 * percent, a second supplier sells it for less) so a fixture edit that breaks
 * the example fails here instead of rendering an empty card.
 */
import { describe, it, expect } from 'vitest';
import { landingFacts } from '../src/lib/server/landing-facts';
import { computePriceDeviations, overpaidOnLine } from '../src/lib/server/price-deviations';
import { CHART_BOX, SAMPLE_ALERT_THRESHOLD, SAMPLE_DELIVERIES, SAMPLE_PERIOD, sampleChart } from '../src/lib/landing-sample';

describe('sample alert computed by the real deviation engine', () => {
	const alert = landingFacts().sampleAlert;

	it('produces exactly the alert the engine reports for the fixture', () => {
		expect(alert).not.toBeNull();
		const lines = SAMPLE_DELIVERIES.map((d) => ({
			productId: 1, description: 'sample', supplierId: d.supplier === 'A' ? 1 : 2, supplierName: d.supplier,
			invoiceDate: d.date, unit: 'l', unitPrice: d.pricePerLitre, normalizedUnitPrice: d.pricePerLitre, baseUnit: 'l',
			totalPrice: Math.round(d.litres * d.pricePerLitre * 100) / 100,
		}));
		const [top] = computePriceDeviations(lines, SAMPLE_PERIOD.from, SAMPLE_PERIOD.to, SAMPLE_ALERT_THRESHOLD);
		expect(alert!.supplier).toBe(top!.supplierName);
		expect(alert!.deviationPct).toBe(top!.deviationPct);
		expect(alert!.latestPrice).toBe(top!.latestPrice);
		expect(alert!.referencePrice).toBe(top!.referencePrice);
		expect(alert!.extraPaid).toBeCloseTo(top!.extraPaid, 2);
	});

	it('tells the intended story: a small rise from A, a cheaper offer from B', () => {
		expect(alert!.supplier).toBe('A');
		expect(alert!.deviationPct).toBeGreaterThan(SAMPLE_ALERT_THRESHOLD * 100);
		expect(alert!.deviationPct).toBeLessThan(5);
		expect(alert!.lastDate).toBe(SAMPLE_PERIOD.to);
		expect(alert!.alternative?.supplier).toBe('B');
		expect(alert!.alternative!.price).toBeLessThan(alert!.latestPrice);
	});

	it('overpaid euros match the engine formula on the one delivery that rose', () => {
		const rose = SAMPLE_DELIVERIES.find((d) => d.date === SAMPLE_PERIOD.to)!;
		const deviation = (alert!.latestPrice - alert!.referencePrice) / alert!.referencePrice;
		expect(alert!.extraPaid).toBeCloseTo(overpaidOnLine(rose.litres * rose.pricePerLitre, deviation), 2);
	});

	it('stays silent at the default 15 % threshold — the example only fires because the threshold was lowered', () => {
		const lines = SAMPLE_DELIVERIES.map((d) => ({
			productId: 1, description: 'sample', supplierId: d.supplier === 'A' ? 1 : 2, supplierName: d.supplier,
			invoiceDate: d.date, unit: 'l', unitPrice: d.pricePerLitre, normalizedUnitPrice: d.pricePerLitre, baseUnit: 'l',
			totalPrice: d.litres * d.pricePerLitre,
		}));
		expect(computePriceDeviations(lines, SAMPLE_PERIOD.from, SAMPLE_PERIOD.to)).toEqual([]);
	});
});

describe('sampleChart geometry', () => {
	const chart = sampleChart(SAMPLE_DELIVERIES, 'A');

	it('plots every delivery inside the plot area, in date order', () => {
		expect(chart.points).toHaveLength(SAMPLE_DELIVERIES.length);
		const dates = chart.points.map((p) => p.delivery.date);
		expect(dates).toEqual([...dates].sort());
		for (const p of chart.points) {
			expect(p.x).toBeGreaterThanOrEqual(CHART_BOX.left);
			expect(p.x).toBeLessThanOrEqual(CHART_BOX.width - CHART_BOX.right);
			expect(p.y).toBeGreaterThanOrEqual(CHART_BOX.top);
			expect(p.y).toBeLessThanOrEqual(chart.baseline);
		}
	});

	it('draws a higher price higher on screen', () => {
		const a = chart.points.filter((p) => p.delivery.supplier === 'A');
		expect(a.at(-1)!.y).toBeLessThan(a[0]!.y);
	});

	it('draws the step line through supplier A only, as a step (price holds until the next delivery)', () => {
		const a = chart.points.filter((p) => p.delivery.supplier === 'A');
		expect(chart.stepPath.startsWith(`M${a[0]!.x} ${a[0]!.y}`)).toBe(true);
		expect(chart.stepPath.match(/H/g)).toHaveLength(a.length - 1);
	});

	it('labels the axis with ticks spanning the data, top to bottom', () => {
		const prices = SAMPLE_DELIVERIES.map((d) => d.pricePerLitre);
		expect(chart.ticks[0]!.value).toBeGreaterThanOrEqual(Math.max(...prices));
		expect(chart.ticks.at(-1)!.value).toBeLessThanOrEqual(Math.min(...prices));
		expect(chart.ticks[0]!.y).toBeLessThan(chart.ticks.at(-1)!.y);
	});
});
