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
	const parts = href.split('?');
	const path = parts[0] ?? '';
	const query = parts[1] ?? '';
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

const MAX_CACHE_SIZE = 2000;

const monthBoundsCache = new Map<string, { rangeFrom: string; rangeTo: string }>();
const daysBetweenCache = new Map<string, number>();
const addDaysIsoCache = new Map<string, string>();
const previousRangeCache = new Map<string, { rangeFrom: string; rangeTo: string }>();

export function monthBounds(month: string): { rangeFrom: string; rangeTo: string } {
	const cached = monthBoundsCache.get(month);
	if (cached) return cached;
	const year = parseInt(month.slice(0, 4), 10);
	const m = parseInt(month.slice(5, 7), 10);
	const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
	const res = { rangeFrom: `${month}-01`, rangeTo: `${month}-${String(lastDay).padStart(2, '0')}` };
	if (monthBoundsCache.size >= MAX_CACHE_SIZE) monthBoundsCache.clear();
	monthBoundsCache.set(month, res);
	return res;
}

export function isFullMonth(rangeFrom: string, rangeTo: string): boolean {
	const bounds = monthBounds(monthOf(rangeFrom));
	return bounds.rangeFrom === rangeFrom && bounds.rangeTo === rangeTo;
}

export function addDaysIso(dateStr: string, days: number): string {
	const key = `${dateStr}:${days}`;
	const cached = addDaysIsoCache.get(key);
	if (cached) return cached;
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	const res = d.toISOString().slice(0, 10);
	if (addDaysIsoCache.size >= MAX_CACHE_SIZE) addDaysIsoCache.clear();
	addDaysIsoCache.set(key, res);
	return res;
}

export function daysBetween(rangeFrom: string, rangeTo: string): number {
	const key = `${rangeFrom}:${rangeTo}`;
	const cached = daysBetweenCache.get(key);
	if (cached !== undefined) return cached;
	const res = Math.round((Date.parse(`${rangeTo}T00:00:00Z`) - Date.parse(`${rangeFrom}T00:00:00Z`)) / 86_400_000);
	if (daysBetweenCache.size >= MAX_CACHE_SIZE) daysBetweenCache.clear();
	daysBetweenCache.set(key, res);
	return res;
}

export function previousRange(rangeFrom: string, rangeTo: string): { rangeFrom: string; rangeTo: string } {
	const key = `${rangeFrom}:${rangeTo}`;
	const cached = previousRangeCache.get(key);
	if (cached) return cached;
	let res: { rangeFrom: string; rangeTo: string };
	if (isFullMonth(rangeFrom, rangeTo)) {
		res = monthBounds(shiftMonth(monthOf(rangeFrom), -1));
	} else {
		const span = daysBetween(rangeFrom, rangeTo);
		const prevTo = addDaysIso(rangeFrom, -1);
		res = { rangeFrom: addDaysIso(prevTo, -span), rangeTo: prevTo };
	}
	if (previousRangeCache.size >= MAX_CACHE_SIZE) previousRangeCache.clear();
	previousRangeCache.set(key, res);
	return res;
}

export function resolveMonth(param: string | null, currentMonth: string): string {
	return parseMonthParam(param, currentMonth);
}
