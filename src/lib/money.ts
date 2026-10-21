const PLAIN_AMOUNT = /^(\d+)(?:[.,](\d+))?$/;
const ES_GROUPED_AMOUNT = /^(\d{1,3}(?:\.\d{3})*),(\d+)$/;
const US_GROUPED_AMOUNT = /^(\d{1,3}(?:,\d{3})*)\.(\d+)$/;
const LONE_DOT_THOUSANDS = /^([1-9]\d{0,2})\.(\d{3})$/;

export type MoneyInput = string | number | null | undefined;

const MAX_CACHE_SIZE = 2000;
type NormalizedParts = { sign: string; intPart: string; fracPart: string };
const normalizeAmountCache = new Map<string, NormalizedParts | null>();
const normalizePlainCache = new Map<string, NormalizedParts | null>();
const toCentsCache = new Map<string, number | null>();

function groupedParts(s: string): NormalizedParts | null {
	const re = s.lastIndexOf(',') > s.lastIndexOf('.') ? ES_GROUPED_AMOUNT : US_GROUPED_AMOUNT;
	const grouped = re.exec(s);
	if (!grouped) return null;
	return { sign: '', intPart: (grouped[1] ?? '').replace(/[.,]/g, ''), fracPart: grouped[2] ?? '' };
}

function parseParts(value: string, dotIsDecimal: boolean): NormalizedParts | null {
	let s = value.replace(/\s/g, '');
	let sign = '';
	if (s.startsWith('-')) {
		sign = '-';
		s = s.slice(1);
	} else if (s.startsWith('+')) {
		s = s.slice(1);
	}
	if (s === '') return null;

	let parts: NormalizedParts | null;
	if (s.includes(',') && s.includes('.')) {
		parts = groupedParts(s);
	} else {
		const thousands = dotIsDecimal ? null : LONE_DOT_THOUSANDS.exec(s);
		const plain = thousands ?? PLAIN_AMOUNT.exec(s);
		if (!plain) return null;
		parts = thousands
			? { sign: '', intPart: (plain[1] ?? '') + (plain[2] ?? ''), fracPart: '' }
			: { sign: '', intPart: plain[1] ?? '', fracPart: plain[2] ?? '' };
	}
	return parts && { ...parts, sign };
}

function normalizeAmountString(value: string, dotIsDecimal = false): NormalizedParts | null {
	const cache = dotIsDecimal ? normalizePlainCache : normalizeAmountCache;
	const cached = cache.get(value);
	if (cached !== undefined) return cached;

	const parts = parseParts(value, dotIsDecimal);
	if (cache.size >= MAX_CACHE_SIZE) cache.clear();
	cache.set(value, parts);
	return parts;
}

function partsToNumber(parts: NormalizedParts | null): number | null {
	if (!parts) return null;
	const frac = parts.fracPart ? '.' + parts.fracPart : '';
	const n = Number(`${parts.sign}${parts.intPart}${frac}`);
	return Number.isFinite(n) ? n : null;
}

export function parseAmount(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value !== 'string') return null;
	return partsToNumber(normalizeAmountString(value));
}

export function parsePlainNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value !== 'string') return null;
	return partsToNumber(normalizeAmountString(value, true));
}

function centsFromParts(parts: NormalizedParts | null): number | null {
	if (!parts) return null;
	const { sign, intPart, fracPart } = parts;
	const frac2 = (fracPart + '00').slice(0, 2);
	const roundUp = fracPart.length > 2 && Number(fracPart[2]) >= 5;
	let cents = Number(intPart) * 100 + Number(frac2);
	if (roundUp) cents += 1;
	if (!Number.isFinite(cents)) return null;
	return sign ? -cents : cents;
}

export function toCents(value: MoneyInput): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return null;
		return centsFromParts(normalizeAmountString(value.toString(), true));
	}

	const cached = toCentsCache.get(value);
	if (cached !== undefined) return cached;

	const cents = centsFromParts(normalizeAmountString(value));
	if (toCentsCache.size >= MAX_CACHE_SIZE) toCentsCache.clear();
	toCentsCache.set(value, cents);
	return cents;
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

export function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
	return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
