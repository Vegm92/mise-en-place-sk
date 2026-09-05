/**
 * One period rule per page type (ADR-038): dashboard and budgets browse a
 * calendar month (`?month=YYYY-MM`), list and analytics pages browse a rolling
 * range (`?period=24h|1w|1m|3m|6m|1y|all`), everything else has no picker.
 * "Today" is the restaurant-local date (APP_TIMEZONE, default Europe/Madrid),
 * not the UTC slice of `toISOString()` that used to put a 00:30 upload on
 * yesterday's dashboard.
 */
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_RANGE_PERIOD, RANGE_PERIODS, isFullMonth, isRangePeriod, monthBounds, periodModeForPath,
	periodModeForRoute, previousRange, withPeriodParam,
} from '../src/lib/period';
import { localToday, monthRange, periodRange, resolvePeriod } from '../src/lib/server/period-range';

const LATE_UTC = new Date('2026-09-05T22:30:00Z');

describe('period modes per page type', () => {
	it('classifies every app path', () => {
		expect(periodModeForPath('/dashboard')).toBe('month');
		expect(periodModeForPath('/budgets')).toBe('month');
		for (const p of ['/invoices', '/suppliers', '/products', '/recipes', '/analytics/spend']) expect(periodModeForPath(p), p).toBe('range');
		for (const p of ['/invoices/export', '/invoice/12', '/suppliers/3', '/products/9', '/recipes/1', '/analytics/prices', '/analytics/extraction', '/reminders', '/digest', '/reports', '/reports/weekly', '/settings', '/billing', '/chat', '/help', '/batch/abc', '/plantilla-lista', '/']) {
			expect(periodModeForPath(p), p).toBe('none');
		}
	});

	it('ignores a locale prefix and a trailing slash', () => {
		expect(periodModeForPath('/en/dashboard')).toBe('month');
		expect(periodModeForPath('/es/invoices/')).toBe('range');
	});

	it('maps SvelteKit route ids through the (app) group', () => {
		expect(periodModeForRoute('/(app)/dashboard')).toBe('month');
		expect(periodModeForRoute('/(app)/analytics/spend')).toBe('range');
		expect(periodModeForRoute('/(app)/invoice/[id]')).toBe('none');
		expect(periodModeForRoute(null)).toBe('none');
	});
});

describe('links carry the period only where the target honours it', () => {
	const state = { activePeriod: '3m', activeMonth: '2026-07', currentMonth: '2026-09' };
	it('appends ?period to range pages, ?month to month pages, nothing elsewhere', () => {
		expect(withPeriodParam('/invoices', state)).toBe('/invoices?period=3m');
		expect(withPeriodParam('/dashboard', state)).toBe('/dashboard?month=2026-07');
		expect(withPeriodParam('/reminders', state)).toBe('/reminders');
		expect(withPeriodParam('/analytics/prices', state)).toBe('/analytics/prices');
	});
	it('drops the defaults so the canonical URL stays clean', () => {
		expect(withPeriodParam('/invoices', { ...state, activePeriod: DEFAULT_RANGE_PERIOD })).toBe('/invoices');
		expect(withPeriodParam('/dashboard', { ...state, activeMonth: '2026-09' })).toBe('/dashboard');
		expect(withPeriodParam('/invoices', { ...state, activePeriod: 'quarter' })).toBe('/invoices');
	});
	it('keeps existing query parameters', () => {
		expect(withPeriodParam('/invoices?status=pending', state)).toBe('/invoices?status=pending&period=3m');
	});
});

describe('restaurant-local today', () => {
	it('is tomorrow in Madrid when UTC is still 22:30', () => {
		expect(localToday(LATE_UTC, 'Europe/Madrid')).toBe('2026-09-06');
		expect(localToday(LATE_UTC, 'UTC')).toBe('2026-09-05');
	});
	it('defaults to Europe/Madrid', () => {
		expect(localToday(LATE_UTC)).toBe('2026-09-06');
	});
});

describe('periodRange (rolling)', () => {
	it('accepts only the shared vocabulary and falls back to 1m', () => {
		expect(RANGE_PERIODS).toEqual(['24h', '1w', '1m', '3m', '6m', '1y', 'all']);
		expect(isRangePeriod('quarter')).toBe(false);
		expect(periodRange('quarter', LATE_UTC).activePeriod).toBe('1m');
		expect(periodRange(new URL('http://x/invoices?period=90d'), LATE_UTC).activePeriod).toBe('1m');
		expect(periodRange(null, LATE_UTC).activePeriod).toBe('1m');
	});
	it('slices from the local today', () => {
		expect(periodRange('1w', LATE_UTC)).toEqual({ rangeFrom: '2026-08-31', rangeTo: '2026-09-06', activePeriod: '1w' });
		expect(periodRange('24h', LATE_UTC)).toEqual({ rangeFrom: '2026-09-06', rangeTo: '2026-09-06', activePeriod: '24h' });
		expect(periodRange('1m', LATE_UTC).rangeFrom).toBe('2026-08-08');
		expect(periodRange('all', LATE_UTC).rangeFrom).toBe('2000-01-01');
	});
});

describe('monthRange (calendar)', () => {
	it('defaults to the current local month and clamps the future', () => {
		expect(monthRange(null, LATE_UTC)).toEqual({ rangeFrom: '2026-09-01', rangeTo: '2026-09-30', activeMonth: '2026-09', currentMonth: '2026-09' });
		expect(monthRange(new URL('http://x/dashboard?month=2026-02'), LATE_UTC)).toMatchObject({ rangeFrom: '2026-02-01', rangeTo: '2026-02-28', activeMonth: '2026-02' });
		expect(monthRange(new URL('http://x/dashboard?month=2027-01'), LATE_UTC).activeMonth).toBe('2026-09');
		expect(monthRange('2024-02', LATE_UTC).rangeTo).toBe('2024-02-29');
		expect(monthBounds('2026-12')).toEqual({ rangeFrom: '2026-12-01', rangeTo: '2026-12-31' });
	});
});

describe('previousRange', () => {
	it('steps a calendar month to the previous calendar month, whatever its length', () => {
		expect(isFullMonth('2026-03-01', '2026-03-31')).toBe(true);
		expect(previousRange('2026-03-01', '2026-03-31')).toEqual({ rangeFrom: '2026-02-01', rangeTo: '2026-02-28' });
		expect(previousRange('2026-01-01', '2026-01-31')).toEqual({ rangeFrom: '2025-12-01', rangeTo: '2025-12-31' });
	});
	it('steps a rolling range back by its own length', () => {
		expect(isFullMonth('2026-08-08', '2026-09-06')).toBe(false);
		expect(previousRange('2026-08-08', '2026-09-06')).toEqual({ rangeFrom: '2026-07-09', rangeTo: '2026-08-07' });
		expect(previousRange('2026-09-06', '2026-09-06')).toEqual({ rangeFrom: '2026-09-05', rangeTo: '2026-09-05' });
	});
});

describe('resolvePeriod (layout)', () => {
	it('gives month pages the calendar month and ignores ?period there', () => {
		const state = resolvePeriod(new URL('http://x/dashboard?period=3m&month=2026-08'), '/(app)/dashboard', LATE_UTC);
		expect(state).toMatchObject({ periodMode: 'month', activeMonth: '2026-08', currentMonth: '2026-09', rangeFrom: '2026-08-01', rangeTo: '2026-08-31', today: '2026-09-06' });
	});
	it('gives range pages the rolling range and ignores ?month there', () => {
		const state = resolvePeriod(new URL('http://x/invoices?period=1y&month=2026-01'), '/(app)/invoices', LATE_UTC);
		expect(state).toMatchObject({ periodMode: 'range', activePeriod: '1y', rangeFrom: '2025-09-07', rangeTo: '2026-09-06', activeMonth: '2026-09' });
	});
	it('gives picker-less pages the default range so a stray ?period cannot reshape them', () => {
		const state = resolvePeriod(new URL('http://x/reminders?period=all'), '/(app)/reminders', LATE_UTC);
		expect(state).toMatchObject({ periodMode: 'none', activePeriod: '1m', rangeFrom: '2026-08-08', rangeTo: '2026-09-06' });
	});
});
