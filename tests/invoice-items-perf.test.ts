import { describe, expect, it } from 'vitest';
import { calcTotal } from '$lib/invoice-items';

describe('calcTotal benchmark', () => {
	it('correctly calculates total', () => {
		expect(calcTotal(2, 5.5)).toBe(11);
		expect(calcTotal('2.5', '4')).toBe(10);
		expect(calcTotal(null, 5)).toBeNull();
		expect(calcTotal(2, '')).toBeNull();
	});

	it('benchmarks calcTotal performance', () => {
		const iterations = 500_000;
		const inputs: Array<[string | number | null, string | number | null]> = [
			[12, 4.5],
			['10.5', '2.2'],
			[null, 5],
			[3, '12.99'],
			['', 4],
			[10, undefined as unknown as null]
		];

		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			const input = inputs[i % inputs.length]!;
			calcTotal(input[0], input[1]);
		}
		const elapsed = performance.now() - start;
		console.log(`calcTotal benchmark (${iterations} ops): ${elapsed.toFixed(2)} ms`);
		expect(elapsed).toBeGreaterThan(0);
	});
});
