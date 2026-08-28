import type { ReportDoc, ReportType } from '$lib/reports';
import { toCsv } from '$lib/reports';
import { translations } from '$lib/i18n-messages';
import { categorySlug } from '$lib/constants';
import { isoWeek } from '$lib/server/weekly-digest';
import { buildWeekly } from './weekly';
import { buildMonthly } from './monthly';
import { buildPrices } from './prices';
import { buildPayables } from './payables';
import { shiftIsoWeek } from './shared';

const CSV_LOCALE = 'es';
const KEY_PREFIX = 'rep.';
const PERIOD_CHOICES = 4;

function monthKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(month: string, delta: number): string {
	let year = Number(month.slice(0, 4));
	let m = Number(month.slice(5, 7)) + delta;
	while (m <= 0) { m += 12; year--; }
	while (m > 12) { m -= 12; year++; }
	return `${year}-${String(m).padStart(2, '0')}`;
}

export function periodOptions(type: ReportType, now = new Date()): string[] {
	if (type === 'weekly') {
		const current = isoWeek(now);
		return Array.from({ length: PERIOD_CHOICES }, (_, i) => shiftIsoWeek(current, -i));
	}
	if (type === 'monthly') {
		const current = monthKey(now);
		return Array.from({ length: PERIOD_CHOICES }, (_, i) => shiftMonthKey(current, -i));
	}
	return [];
}

export async function buildReport(
	type: ReportType,
	rid: string,
	period: string | null,
	digest: string | null,
): Promise<ReportDoc> {
	const now = new Date();
	const options = periodOptions(type, now);
	const selected = period && options.includes(period) ? period : options[0];

	switch (type) {
		case 'weekly':   return buildWeekly(rid, selected ?? isoWeek(now), digest, now);
		case 'monthly':  return buildMonthly(rid, selected ?? monthKey(now), now);
		case 'prices':   return buildPrices(rid, monthKey(now), now);
		case 'payables': return buildPayables(rid, now.toISOString().slice(0, 10), now);
	}
}

function translate(key: string): string {
	return (translations[CSV_LOCALE] as Record<string, string>)[key] ?? key;
}

function csvCell(value: string | number | null, columnIndex: number, categoryColumn: number): string | number | null {
	if (typeof value !== 'string') return value;
	if (value.startsWith(KEY_PREFIX)) return translate(value);
	if (columnIndex === categoryColumn) return translate(`category.${categorySlug(value)}`);
	return value;
}

export function reportCsv(doc: ReportDoc): string {
	const categoryColumn = doc.csv.header.indexOf('rep.col.category');
	return toCsv(
		doc.csv.header.map(translate),
		doc.csv.rows.map((row) => row.map((cell, i) => csvCell(cell, i, categoryColumn))),
	);
}
