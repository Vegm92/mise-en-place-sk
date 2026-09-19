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
	if (rows.length === 0) return [];
	const byYear = new Map<number, YearlyPriceInput>();
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i]!;
		byYear.set(r.year, r);
	}
	const years = Array.from(byYear.keys()).sort((a, b) => a - b);
	const res: YearlyPricePoint[] = new Array(years.length);

	for (let i = 0; i < years.length; i++) {
		const year = years[i]!;
		const current = byYear.get(year)!;
		const previous = byYear.get(year - 1) ?? null;
		const price = displayPrice(current);
		const prevPrice = previous ? comparablePrevPrice(current, previous) : null;
		const changePct = price != null && prevPrice != null && prevPrice > 0
			? round1(((price - prevPrice) / prevPrice) * 100)
			: null;

		res[i] = { year, price, prevPrice, changePct };
	}

	return res;
}

export function yoyChangeForYear(rows: YearlyPriceInput[], year: number): number | null {
	let current: YearlyPriceInput | undefined;
	let previous: YearlyPriceInput | undefined;
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i]!;
		if (r.year === year) current = r;
		else if (r.year === year - 1) previous = r;
	}
	if (!current || !previous) return null;
	const price = displayPrice(current);
	const prevPrice = comparablePrevPrice(current, previous);
	if (price == null || prevPrice == null || prevPrice <= 0) return null;
	return round1(((price - prevPrice) / prevPrice) * 100);
}
