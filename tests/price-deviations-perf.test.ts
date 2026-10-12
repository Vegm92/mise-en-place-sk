import { describe, it, expect } from 'vitest';
import { computePriceDeviations, rankSupplierPrices, type DeviationLine } from '../src/lib/server/price-deviations';

function generateLines(count: number): DeviationLine[] {
	const lines: DeviationLine[] = [];
	for (let i = 0; i < count; i++) {
		const day = String((i % 28) + 1).padStart(2, '0');
		const month = String((i % 12) + 1).padStart(2, '0');
		lines.push({
			productId: (i % 50) + 1,
			description: `Product ${i % 50}`,
			supplierId: (i % 10) + 1,
			supplierName: `Supplier ${i % 10}`,
			invoiceDate: `2026-${month}-${day}`,
			unit: 'kg',
			unitPrice: 10 + (i % 5),
			normalizedUnitPrice: 10 + (i % 5),
			baseUnit: 'kg',
			totalPrice: 100 + (i % 50),
		});
	}
	return lines;
}

describe('price-deviations performance', () => {
	it('benchmarks computePriceDeviations and rankSupplierPrices', () => {
		const lines = generateLines(10000);
		const start = performance.now();
		for (let r = 0; r < 10; r++) {
			computePriceDeviations(lines, '2026-01-01', '2026-12-31');
			rankSupplierPrices(lines);
		}
		const elapsed = performance.now() - start;
		console.log(`priceDeviations benchmark (10 ops x 10000 items): ${elapsed.toFixed(2)} ms`);
		expect(elapsed).toBeLessThan(2000);
	});
});
