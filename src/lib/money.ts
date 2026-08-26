const MONEY_INPUT = /^(-)?(\d+)(?:[.,](\d+))?$/;

export type MoneyInput = string | number | null | undefined;

export function toCents(value: MoneyInput): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return null;
		value = value.toString();
	}
	const raw = value.trim();
	if (raw === '') return null;

	const m = MONEY_INPUT.exec(raw);
	if (!m) return null;
	const [, sign, intPart, fracPart = ''] = m;

	const frac2 = (fracPart + '00').slice(0, 2);
	const roundUp = fracPart.length > 2 && Number(fracPart[2]) >= 5;
	let cents = Number(intPart) * 100 + Number(frac2);
	if (roundUp) cents += 1;

	return sign ? -cents : cents;
}

export function fromCents(cents: number): string {
	const rounded = Math.round(cents);
	const sign = rounded < 0 ? '-' : '';
	const abs = Math.abs(rounded);
	const intPart = Math.floor(abs / 100);
	const fracPart = String(abs % 100).padStart(2, '0');
	return `${sign}${intPart}.${fracPart}`;
}

export function toMoneyString(value: MoneyInput): string | null {
	const cents = toCents(value);
	return cents === null ? null : fromCents(cents);
}

export function sumCents(values: Iterable<MoneyInput>): number {
	let total = 0;
	for (const v of values) total += toCents(v) ?? 0;
	return total;
}

export function sumMoney(values: Iterable<MoneyInput>): string {
	return fromCents(sumCents(values));
}

export function moneyEquals(a: MoneyInput, b: MoneyInput): boolean {
	return toCents(a) === toCents(b);
}

export function moneyToNumber(value: MoneyInput): number {
	return (toCents(value) ?? 0) / 100;
}

export function moneyToNullableNumber(value: MoneyInput): number | null {
	const cents = toCents(value);
	return cents === null ? null : cents / 100;
}
