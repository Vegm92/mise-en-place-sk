import { parseMonthParam, shiftMonth } from './formatters';

export const RANGE_PERIODS = ['24h', '1w', '1m', '3m', '6m', '1y', 'all'] as const;
export type RangePeriod = (typeof RANGE_PERIODS)[number];
export const DEFAULT_RANGE_PERIOD: RangePeriod = '1m';
export const RANGE_PERIOD_DAYS: Record<Exclude<RangePeriod, 'all'>, number> = {
	'24h': 0, '1w': 6, '1m': 29, '3m': 89, '6m': 179, '1y': 364,
};
export const ALL_TIME_FROM = '2000-01-01';

export function isRangePeriod(value: unknown): value is RangePeriod {
	return typeof value === 'string' && (RANGE_PERIODS as readonly string[]).includes(value);
}

export type PeriodMode = 'range' | 'month' | 'none';

const MODE_BY_PATH: Record<string, PeriodMode> = {
	'/dashboard': 'month',
	'/budgets': 'month',
	'/invoices': 'range',
	'/suppliers': 'range',
	'/products': 'range',
	'/recipes': 'range',
	'/analytics/spend': 'range',
};

const LOCALE_SEGMENT = /^\/(?:es|en)(?=\/|$)/;

export function periodModeForPath(pathname: string): PeriodMode {
	const path = pathname.replace(LOCALE_SEGMENT, '').replace(/\/+$/, '') || '/';
	return MODE_BY_PATH[path] ?? 'none';
}

export function periodModeForRoute(routeId: string | null): PeriodMode {
	if (!routeId) return 'none';
	return periodModeForPath(routeId.replace(/\/\([^)]+\)/g, ''));
}

export interface PeriodLinkState {
	activePeriod: string;
	activeMonth: string;
	currentMonth: string;
}

export function withPeriodParam(href: string, state: PeriodLinkState): string {
	const [path, query = ''] = href.split('?');
	const params = new URLSearchParams(query);
	const mode = periodModeForPath(path);
	if (mode === 'range' && state.activePeriod !== DEFAULT_RANGE_PERIOD && isRangePeriod(state.activePeriod)) {
		params.set('period', state.activePeriod);
	} else if (mode === 'month' && state.activeMonth && state.activeMonth !== state.currentMonth) {
		params.set('month', state.activeMonth);
	}
	const qs = params.toString();
	return qs ? `${path}?${qs}` : path;
}

export function monthOf(dateStr: string): string {
	return dateStr.slice(0, 7);
}

export function monthBounds(month: string): { rangeFrom: string; rangeTo: string } {
	const year = parseInt(month.slice(0, 4), 10);
	const m = parseInt(month.slice(5, 7), 10);
	const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
	return { rangeFrom: `${month}-01`, rangeTo: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export function isFullMonth(rangeFrom: string, rangeTo: string): boolean {
	const bounds = monthBounds(monthOf(rangeFrom));
	return bounds.rangeFrom === rangeFrom && bounds.rangeTo === rangeTo;
}

export function addDaysIso(dateStr: string, days: number): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function daysBetween(rangeFrom: string, rangeTo: string): number {
	return Math.round((Date.parse(`${rangeTo}T00:00:00Z`) - Date.parse(`${rangeFrom}T00:00:00Z`)) / 86_400_000);
}

export function previousRange(rangeFrom: string, rangeTo: string): { rangeFrom: string; rangeTo: string } {
	if (isFullMonth(rangeFrom, rangeTo)) return monthBounds(shiftMonth(monthOf(rangeFrom), -1));
	const span = daysBetween(rangeFrom, rangeTo);
	const prevTo = addDaysIso(rangeFrom, -1);
	return { rangeFrom: addDaysIso(prevTo, -span), rangeTo: prevTo };
}

export function resolveMonth(param: string | null, currentMonth: string): string {
	return parseMonthParam(param, currentMonth);
}
