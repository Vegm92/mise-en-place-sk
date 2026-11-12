import TrendingUp from '@lucide/svelte/icons/trending-up';
import Wallet from '@lucide/svelte/icons/wallet';
import FileCheck from '@lucide/svelte/icons/file-check';
import CalendarOff from '@lucide/svelte/icons/calendar-off';
import Truck from '@lucide/svelte/icons/truck';
import Tags from '@lucide/svelte/icons/tags';
import type { Severity, WorkKind } from '$lib/dashboard-turno';
import { fmtDateShort, fmtDecimal1, fmtEur, type Locale } from '$lib/formatters';

export const WORK_ICON: Record<WorkKind, typeof TrendingUp> = {
	price: TrendingUp,
	budget: Wallet,
	review: FileCheck,
	missing: CalendarOff,
	supplier: Truck,
	lines: Tags,
};

export const WORK_TONE: Record<Severity, [string, string]> = {
	high: ['var(--mep-neg)', 'var(--mep-neg-soft)'],
	med: ['var(--mep-warn)', 'var(--mep-warn-soft)'],
	low: ['var(--mep-caution)', 'var(--mep-caution-soft)'],
};

export function localiseWorkDates(
	vars: Record<string, string | number>,
	loc: string,
): Record<string, string | number> {
	if (!('date' in vars)) return vars;
	const dateStr = String(vars.date);
	return { ...vars, date: fmtDateShort(dateStr, loc as Locale) };
}

const PRICE_MONEY_KEYS = ['from', 'to', 'altPrice'] as const;

export function localiseWorkVars(
	kind: WorkKind,
	vars: Record<string, string | number>,
	loc: string,
): Record<string, string | number> {
	const out = localiseWorkDates(vars, loc);
	if (kind !== 'price') return out;
	const next = { ...out };
	for (const key of PRICE_MONEY_KEYS) {
		const v = next[key];
		if (typeof v === 'number') next[key] = fmtEur(v, loc as Locale);
	}
	if (typeof next.pct === 'number') next.pct = fmtDecimal1(next.pct, loc as Locale);
	return next;
}
