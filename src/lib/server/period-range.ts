import {
	ALL_TIME_FROM, DEFAULT_RANGE_PERIOD, RANGE_PERIOD_DAYS, addDaysIso, isRangePeriod, monthBounds, monthOf,
	periodModeForRoute, resolveMonth, type PeriodMode, type RangePeriod,
} from '$lib/period';

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Europe/Madrid';

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

export function localToday(now: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
	let formatter = dayFormatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
		dayFormatters.set(timeZone, formatter);
	}
	return formatter.format(now);
}

export interface RangeResult {
	rangeFrom: string;
	rangeTo: string;
	activePeriod: RangePeriod;
}

function requestedPeriod(urlOrPeriod: URL | string | null): RangePeriod {
	const raw = typeof urlOrPeriod === 'string' ? urlOrPeriod : urlOrPeriod?.searchParams.get('period');
	return isRangePeriod(raw) ? raw : DEFAULT_RANGE_PERIOD;
}

export function periodRange(urlOrPeriod: URL | string | null, now: Date = new Date()): RangeResult {
	const activePeriod = requestedPeriod(urlOrPeriod);
	const rangeTo = localToday(now);
	const rangeFrom = activePeriod === 'all' ? ALL_TIME_FROM : addDaysIso(rangeTo, -RANGE_PERIOD_DAYS[activePeriod]);
	return { rangeFrom, rangeTo, activePeriod };
}

export interface MonthResult {
	rangeFrom: string;
	rangeTo: string;
	activeMonth: string;
	currentMonth: string;
}

export function monthRange(urlOrMonth: URL | string | null, now: Date = new Date()): MonthResult {
	const currentMonth = monthOf(localToday(now));
	const raw = typeof urlOrMonth === 'string' ? urlOrMonth : urlOrMonth?.searchParams.get('month') ?? null;
	const activeMonth = resolveMonth(raw, currentMonth);
	return { ...monthBounds(activeMonth), activeMonth, currentMonth };
}

export interface PeriodState extends RangeResult {
	periodMode: PeriodMode;
	activeMonth: string;
	currentMonth: string;
	today: string;
}

export function resolvePeriod(url: URL, routeId: string | null, now: Date = new Date()): PeriodState {
	const periodMode = periodModeForRoute(routeId);
	const today = localToday(now);
	const month = monthRange(url, now);
	if (periodMode === 'month') {
		return { periodMode, activePeriod: DEFAULT_RANGE_PERIOD, today, ...month };
	}
	const range = periodRange(periodMode === 'range' ? url : null, now);
	return { periodMode, today, activeMonth: month.currentMonth, currentMonth: month.currentMonth, ...range };
}
