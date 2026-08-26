import { toIsoDate } from '../dates';

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

export { toIsoDate };

export function isBlankOrIsoDate(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (String(value).trim() === '') return true;
	return toIsoDate(value) !== null;
}

export function toMonthKey(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const raw = String(value).trim();
	const m = MONTH_KEY.exec(raw);
	if (!m) return null;
	const month = Number(m[2]);
	if (month < 1 || month > 12) return null;
	return raw;
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

export function monthKeyStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function isoDateOffset(dateStr: string, days: number): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
