import type { Cell, ReportBar, Tone } from '$lib/reports';
import { fmtEur } from '$lib/formatters';
import { categoryColor } from '$lib/colors';

export const DATA_NEUTRAL = 'var(--mep-series-other)';

export function pctDelta(current: number, previous: number): number | null {
	if (!previous) return null;
	return ((current - previous) / Math.abs(previous)) * 100;
}

export function fmtPct(value: number | null, digits = 1): string {
	if (value === null || !Number.isFinite(value)) return '—';
	const sign = value > 0 ? '+' : value < 0 ? '−' : '';
	return `${sign}${Math.abs(value).toFixed(digits).replace('.', ',')} %`;
}

export function fmtPlainPct(value: number, digits = 1): string {
	return `${value.toFixed(digits).replace('.', ',')} %`;
}

export function deltaTone(value: number | null, riseIsBad = true): Tone | null {
	if (value === null || !Number.isFinite(value) || value === 0) return null;
	const bad = riseIsBad ? value > 0 : value < 0;
	return bad ? 'up' : 'down';
}

export function deltaCell(value: number | null, riseIsBad = true): Cell {
	const tone = deltaTone(value, riseIsBad);
	const text = fmtPct(value);
	return tone ? { v: text, tone } : text;
}

export function money(value: number): string {
	return fmtEur(value);
}

export function moneyPlain(value: number): string {
	return value.toFixed(2).replace('.', ',');
}

export function categoryBars(
	items: { label: string; value: number }[],
	byCategory: boolean,
): ReportBar[] {
	const max = Math.max(...items.map((i) => i.value), 0) || 1;
	return items.map((item) => ({
		label: item.label,
		value: money(item.value),
		pct: Math.round((item.value / max) * 100),
		color: byCategory ? categoryColor(item.label) : 'var(--mep-acc)',
		muted: false,
	}));
}

export function isoWeekRange(week: string): { start: string; end: string } {
	const [yearPart, weekPart] = week.split('-W');
	const year = Number(yearPart);
	const weekNum = Number(weekPart);
	const jan4 = new Date(Date.UTC(year, 0, 4));
	const jan4Dow = (jan4.getUTCDay() + 6) % 7;
	const week1Monday = new Date(jan4.getTime() - jan4Dow * 86400000);
	const monday = new Date(week1Monday.getTime() + (weekNum - 1) * 7 * 86400000);
	const sunday = new Date(monday.getTime() + 6 * 86400000);
	return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

export function shiftIsoWeek(week: string, delta: number): string {
	const { start } = isoWeekRange(week);
	const shifted = new Date(Date.parse(start) + delta * 7 * 86400000);
	const d = new Date(shifted);
	d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
	const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
	const weekNum = 1 + Math.round(
		((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7,
	);
	return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function generatedStamp(now: Date): string {
	return now.toISOString().replace('T', ' ').slice(0, 16);
}
