import TrendingUp from '@lucide/svelte/icons/trending-up';
import Wallet from '@lucide/svelte/icons/wallet';
import FileCheck from '@lucide/svelte/icons/file-check';
import CalendarOff from '@lucide/svelte/icons/calendar-off';
import Truck from '@lucide/svelte/icons/truck';
import type { Severity, WorkKind } from '$lib/dashboard-turno';
import { fmtDateShort, type Locale } from '$lib/formatters';

export const WORK_ICON: Record<WorkKind, typeof TrendingUp> = {
	price: TrendingUp,
	budget: Wallet,
	review: FileCheck,
	missing: CalendarOff,
	supplier: Truck,
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
