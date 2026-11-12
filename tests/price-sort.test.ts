import { describe, expect, it } from 'vitest';
import { sortPriceRowsRisesFirst } from '../src/lib/price-sort';

const row = (id: string, change_pct: number | null) => ({ id, change_pct });

describe('sortPriceRowsRisesFirst', () => {
	it('puts a single small rise above many larger drops', () => {
		const rows = [row('d1', -36.4), row('d2', -30.8), row('d3', -26.7), row('r1', 4.2), row('d4', -21.1)];
		expect(sortPriceRowsRisesFirst(rows).map((r) => r.id)).toEqual(['r1', 'd1', 'd2', 'd3', 'd4']);
	});

	it('orders rises by change_pct descending, then the rest by absolute change with nulls last', () => {
		const rows = [
			row('null', null),
			row('flat', 0),
			row('r-small', 1.5),
			row('d-big', -40),
			row('r-big', 22.1),
			row('d-small', -2),
			row('r-mid', 10),
		];
		expect(sortPriceRowsRisesFirst(rows).map((r) => r.id)).toEqual([
			'r-big',
			'r-mid',
			'r-small',
			'd-big',
			'd-small',
			'flat',
			'null',
		]);
	});

	it('does not mutate the input array', () => {
		const rows = [row('d', -5), row('r', 5)];
		sortPriceRowsRisesFirst(rows);
		expect(rows.map((r) => r.id)).toEqual(['d', 'r']);
	});
});
