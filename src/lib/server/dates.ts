import { toIsoDate, monthKey, isoDateOffset } from '../dates';

const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const MONTH_KEY_CACHE_MAX = 2000;
const monthKeyCache = new Map<string, string | null>();

export { toIsoDate, monthKey, isoDateOffset };

export function isBlankOrIsoDate(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (String(value).trim() === '') return true;
	return toIsoDate(value) !== null;
}

export function toMonthKey(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const raw = String(value).trim();
	if (!raw) return null;

	const cached = monthKeyCache.get(raw);
	if (cached !== undefined) return cached;

	let res: string | null = null;
	const m = MONTH_KEY.exec(raw);
	if (m) {
		const month = Number(m[2]);
		if (month >= 1 && month <= 12) {
			res = raw;
		}
	}

	if (monthKeyCache.size >= MONTH_KEY_CACHE_MAX) {
		monthKeyCache.clear();
	}
	monthKeyCache.set(raw, res);
	return res;
}

export function addDays(d: Date, days: number): Date {
	const r = new Date(d); r.setDate(r.getDate() + days); return r;
}

export function addMonths(d: Date, months: number): Date {
	const r = new Date(d); r.setMonth(r.getMonth() + months); return r;
}

export function monday(d: Date): Date {
	return addDays(d, -((d.getDay() + 6) % 7));
}

export function firstOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

