const PLAIN_AMOUNT = /^(\d+)(?:[.,](\d+))?$/;
const ES_GROUPED_AMOUNT = /^(\d{1,3}(?:\.\d{3})*),(\d+)$/;
const US_GROUPED_AMOUNT = /^(\d{1,3}(?:,\d{3})*)\.(\d+)$/;

export type MoneyInput = string | number | null | undefined;

const MAX_CACHE_SIZE = 2000;
type NormalizedParts = { sign: string; intPart: string; fracPart: string };
const normalizeAmountCache = new Map<string, NormalizedParts | null>();
const toCentsCache = new Map<string, number | null>();

function normalizeAmountString(value: string): NormalizedParts | null {
	let cached = normalizeAmountCache.get(value);
	if (cached !== undefined) return cached;

	let s = value.replace(/\s/g, '');
	if (s === '') {
		if (normalizeAmountCache.size >= MAX_CACHE_SIZE) normalizeAmountCache.clear();
		normalizeAmountCache.set(value, null);
		return null;
	}

	let sign = '';
	if (s.startsWith('-')) {
		sign = '-';
		s = s.slice(1);
	} else if (s.startsWith('+')) {
		s = s.slice(1);
	}
	if (s === '') {
		if (normalizeAmountCache.size >= MAX_CACHE_SIZE) normalizeAmountCache.clear();
		normalizeAmountCache.set(value, null);
		return null;
	}

	if (s.includes(',') && s.includes('.')) {
		const re = s.lastIndexOf(',') > s.lastIndexOf('.') ? ES_GROUPED_AMOUNT : US_GROUPED_AMOUNT;
		const grouped = re.exec(s);
		if (!grouped) {
			if (normalizeAmountCache.size >= MAX_CACHE_SIZE) normalizeAmountCache.clear();
			normalizeAmountCache.set(value, null);
			return null;
		}
		cached = { sign, intPart: (grouped[1] ?? '').replace(/[.,]/g, ''), fracPart: grouped[2] ?? '' };
	} else {
		const plain = PLAIN_AMOUNT.exec(s);
		if (!plain) {
			if (normalizeAmountCache.size >= MAX_CACHE_SIZE) normalizeAmountCache.clear();
			normalizeAmountCache.set(value, null);
			return null;
		}
		cached = { sign, intPart: plain[1] ?? '', fracPart: plain[2] ?? '' };
	}

	if (normalizeAmountCache.size >= MAX_CACHE_SIZE) normalizeAmountCache.clear();
	normalizeAmountCache.set(value, cached);
	return cached;
}

export function parseAmount(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value !== 'string') return null;
	const parts = normalizeAmountString(value);
	if (!parts) return null;
	const frac = parts.fracPart ? '.' + parts.fracPart : '';
	const n = Number(`${parts.sign}${parts.intPart}${frac}`);
	return Number.isFinite(n) ? n : null;
}

export function toCents(value: MoneyInput): number | null {
	if (value === null || value === undefined) return null;
	let raw: string;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return null;
		raw = value.toString();
	} else {
		raw = value;
	}

	let cached = toCentsCache.get(raw);
	if (cached !== undefined) return cached;

	const parts = normalizeAmountString(raw);
	if (!parts) {
		if (toCentsCache.size >= MAX_CACHE_SIZE) toCentsCache.clear();
		toCentsCache.set(raw, null);
		return null;
	}
	const { sign, intPart, fracPart } = parts;

	const frac2 = (fracPart + '00').slice(0, 2);
	const roundUp = fracPart.length > 2 && Number(fracPart[2]) >= 5;
	let cents = Number(intPart) * 100 + Number(frac2);
	if (roundUp) cents += 1;
	if (!Number.isFinite(cents)) {
		if (toCentsCache.size >= MAX_CACHE_SIZE) toCentsCache.clear();
		toCentsCache.set(raw, null);
		return null;
	}

	cached = sign ? -cents : cents;
	if (toCentsCache.size >= MAX_CACHE_SIZE) toCentsCache.clear();
	toCentsCache.set(raw, cached);
	return cached;
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
