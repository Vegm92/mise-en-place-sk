import { toCents, fromCents, sumCents, type MoneyInput } from './money';

export type TaxType = 'iva' | 'rec';

export type TaxBand = {
	rate: number;
	base: number;
	tax_amount: number;
	type?: TaxType;
};

export type TaxBandInput = {
	rate: string;
	type: string;
	base: string;
	amount: string;
};

export type TaxedLine = {
	totalPrice: MoneyInput;
	rate: MoneyInput;
};

const PERCENT_INPUT = /^(\d+)(?:[.,](\d+))?$/;

export function percentToFraction(value: MoneyInput): number | null {
	if (value === null || value === undefined) return null;
	const raw = String(value).trim().replace(/%$/, '').trim();
	if (raw === '' || !PERCENT_INPUT.test(raw)) return null;
	const n = Number(raw.replace(',', '.'));
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 10000) / 1e6;
}

export function fractionToPercent(rate: MoneyInput): number | null {
	if (rate === null || rate === undefined) return null;
	if (typeof rate === 'string' && rate.trim() === '') return null;
	const n = typeof rate === 'number' ? rate : Number(rate.trim().replace(',', '.'));
	if (!Number.isFinite(n) || n < 0) return null;
	return n > 1 ? Math.round(n * 10000) / 10000 : Math.round(n * 1e6) / 1e4;
}

export function percentInputValue(rate: MoneyInput): string {
	const pct = fractionToPercent(rate);
	return pct === null ? '' : String(pct);
}

export function isTaxType(value: unknown): value is TaxType {
	return value === 'iva' || value === 'rec';
}

export function bandAmountCents(base: MoneyInput, ratePercent: MoneyInput): number | null {
	const baseCents = toCents(base);
	const rate = percentToFraction(ratePercent);
	if (baseCents === null || rate === null) return null;
	return Math.round(baseCents * rate);
}

export function bandsFromInputs(inputs: TaxBandInput[]): TaxBand[] {
	const out: TaxBand[] = [];
	for (const input of inputs) {
		const rate = percentToFraction(input.rate);
		const baseCents = toCents(input.base);
		const amountCents = toCents(input.amount);
		if (rate === null && baseCents === null && amountCents === null) continue;
		const band: TaxBand = {
			rate: rate ?? 0,
			base: (baseCents ?? 0) / 100,
			tax_amount: (amountCents ?? 0) / 100,
		};
		if (isTaxType(input.type)) band.type = input.type;
		out.push(band);
	}
	return out;
}

export function sumTaxCents(bands: TaxBand[]): number {
	let total = 0;
	for (const band of bands) total += toCents(band.tax_amount) ?? 0;
	return total;
}

export function taxableBaseCents(bands: TaxBand[]): number {
	const perType = new Map<string, number>();
	for (const band of bands) {
		const key = band.type === 'rec' ? 'rec' : 'iva';
		perType.set(key, (perType.get(key) ?? 0) + (toCents(band.base) ?? 0));
	}
	return Math.max(0, ...perType.values());
}

export function taxableBaseMoney(bands: TaxBand[]): string {
	return fromCents(taxableBaseCents(bands));
}

export function lineRateFractions(lines: TaxedLine[]): number[] {
	const seen = new Set<number>();
	for (const line of lines) {
		const rate = percentToFraction(line.rate);
		if (rate !== null) seen.add(rate);
	}
	return [...seen].sort((a, b) => b - a);
}

export type TotalReconciliationExtras = {
	discountAmount?: MoneyInput;
	retentionAmount?: MoneyInput;
};

export function detectTotalMismatch(
	lineTotals: Iterable<MoneyInput>,
	taxBands: TaxBand[] | null,
	totalAmount: MoneyInput,
	extras?: TotalReconciliationExtras,
): boolean {
	const totalCents = toCents(totalAmount);
	if (totalCents === null || totalCents <= 0) return false;
	const discountCents = toCents(extras?.discountAmount) ?? 0;
	const retentionCents = toCents(extras?.retentionAmount) ?? 0;
	const calcCents = sumCents(lineTotals) + (taxBands ? sumTaxCents(taxBands) : 0) - discountCents - retentionCents;
	return Math.abs(calcCents - totalCents) > 1;
}

export function bandsFromLines(lines: TaxedLine[], type?: TaxType): TaxBand[] {
	const perRate = new Map<number, number>();
	for (const line of lines) {
		const rate = percentToFraction(line.rate);
		if (rate === null) continue;
		perRate.set(rate, (perRate.get(rate) ?? 0) + (toCents(line.totalPrice) ?? 0));
	}
	return [...perRate.entries()]
		.sort((a, b) => b[0] - a[0])
		.map(([rate, baseCents]) => {
			const band: TaxBand = {
				rate,
				base: baseCents / 100,
				tax_amount: Math.round(baseCents * rate) / 100,
			};
			if (type) band.type = type;
			return band;
		});
}
