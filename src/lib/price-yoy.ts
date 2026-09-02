export interface YearlyPriceInput {
	year: number;
	unitPrice: number | null;
	normalizedUnitPrice: number | null;
	unit: string | null;
}

export interface YearlyPricePoint {
	year: number;
	price: number | null;
	prevPrice: number | null;
	changePct: number | null;
}

function displayPrice(row: YearlyPriceInput): number | null {
	return row.normalizedUnitPrice ?? row.unitPrice ?? null;
}

function comparablePrevPrice(current: YearlyPriceInput, previous: YearlyPriceInput): number | null {
	if (current.normalizedUnitPrice != null && previous.normalizedUnitPrice != null) {
		return previous.normalizedUnitPrice;
	}
	if (
		current.normalizedUnitPrice == null && previous.normalizedUnitPrice == null &&
		current.unit != null && previous.unit != null && current.unit === previous.unit
	) {
		return previous.unitPrice;
	}
	return null;
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

export function pairYearlyPrices(rows: YearlyPriceInput[]): YearlyPricePoint[] {
	const byYear = new Map(rows.map((r) => [r.year, r]));
	const years = [...byYear.keys()].sort((a, b) => a - b);

	return years.map((year) => {
		const current = byYear.get(year)!;
		const previous = byYear.get(year - 1) ?? null;
		const price = displayPrice(current);
		const prevPrice = previous ? comparablePrevPrice(current, previous) : null;
		const changePct = price != null && prevPrice != null && prevPrice > 0
			? round1(((price - prevPrice) / prevPrice) * 100)
			: null;

		return { year, price, prevPrice, changePct };
	});
}

export function yoyChangeForYear(rows: YearlyPriceInput[], year: number): number | null {
	return pairYearlyPrices(rows).find((p) => p.year === year)?.changePct ?? null;
}
