/**
 * Issue #1068 — money math must agree with itself.
 *
 * Two helpers had drifted into several disagreeing copies:
 *
 * - `Date → "YYYY-MM"` existed four times (revenue-math in UTC; formatters,
 *   reports/index and server/dates in the host's local zone), so on a
 *   Europe/Madrid deploy an invoice saved at 00:30 local on the 1st landed in
 *   one month on /admin/revenue and in the next on the monthly spend report.
 *   Four more call sites derived the same key through `toISOString().slice(0, 7)`.
 * - `median()` existed three times: the alert engine took the lower middle
 *   value on even-length input, the deviation engine and supplier cadence
 *   averaged the two middles — so the price-shock and deviation engines
 *   computed different reference prices from identical history.
 *
 * The single implementations now live in `src/lib/dates.ts` (`monthKey`, UTC
 * calendar fields — timestamps are UTC, never local) and `src/lib/money.ts`
 * (`median`, averaging on even length). The source sweep below fails the build
 * if a second copy of either comes back.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { monthKey } from '../src/lib/dates';
import { median } from '../src/lib/money';
import { monthKey as revenueMonthKey } from '../src/lib/revenue-math';
import { monthKey as serverMonthKey } from '../src/lib/server/dates';
import { median as serverMedian } from '../src/lib/server/money';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function sourceFiles(dir: string = SRC): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) found.push(...sourceFiles(full));
		else if (/\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(full);
	}
	return found;
}

const sources = sourceFiles().map((file) => ({
	rel: path.relative(ROOT, file).split(path.sep).join('/'),
	text: readFileSync(file, 'utf8'),
}));

const MONTH_KEY_HOME = 'src/lib/dates.ts';
const MEDIAN_HOME = 'src/lib/money.ts';

// `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` and its UTC twin.
const MONTH_KEY_TEMPLATE = /get(UTC)?FullYear\(\)\}-\$\{String\([^)]*get(UTC)?Month\(\)\s*\+\s*1\)/;
// `new Date().toISOString().slice(0, 7)` — the same key by another road.
const ISO_MONTH_SLICE = /toISOString\(\)\s*\.\s*(slice|substring|substr)\(\s*0\s*,\s*7\s*\)/;
const MEDIAN_DEFINITION = /\b(function\s+median\w*\s*\(|const\s+median\w*\s*=\s*(\([^)]*\)|\w+)\s*=>)/;
const SORTED_MIDDLE = /\.sort\(\(\w+, \w+\) => \w+ - \w+\)[\s\S]{0,240}?length(\s*-\s*1\))?\s*\/\s*2/;

describe('monthKey — one UTC month key (issue #1068)', () => {
	it('buckets by UTC calendar fields, not the host zone', () => {
		// 00:30 on 1 March in Madrid (UTC+1 in winter) is still 28 February in UTC.
		const madridJustAfterMidnight = new Date('2026-03-01T00:30:00+01:00');
		expect(madridJustAfterMidnight.toISOString()).toBe('2026-02-28T23:30:00.000Z');
		expect(monthKey(madridJustAfterMidnight)).toBe('2026-02');

		const madridWallClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', month: '2-digit' })
			.format(madridJustAfterMidnight);
		expect(madridWallClock).toBe('03');
	});

	it('handles the year boundary the same way', () => {
		expect(monthKey(new Date('2026-01-01T00:59:00+02:00'))).toBe('2025-12');
		expect(monthKey(new Date('2025-12-31T23:59:59Z'))).toBe('2025-12');
		expect(monthKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
	});

	it('zero-pads single-digit months', () => {
		expect(monthKey(new Date('2026-07-15T12:00:00Z'))).toBe('2026-07');
	});

	it('is the same function behind revenue-math and server/dates', () => {
		expect(revenueMonthKey).toBe(monthKey);
		expect(serverMonthKey).toBe(monthKey);
	});
});

describe('median — one averaging median (issue #1068)', () => {
	it('returns the middle value on odd length', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([7])).toBe(7);
	});

	it('averages the two middle values on even length', () => {
		expect(median([1, 2, 3, 4])).toBe(2.5);
		expect(median([2.0, 3.0])).toBe(2.5);
		expect(median([10, 1])).toBe(5.5);
	});

	it('returns 0 for an empty input, like the callers it replaced', () => {
		expect(median([])).toBe(0);
	});

	it('does not mutate its input', () => {
		const values = [3, 1, 2];
		median(values);
		expect(values).toEqual([3, 1, 2]);
	});

	it('is the same function behind the server re-export', () => {
		expect(serverMedian).toBe(median);
	});
});

describe('source sweep — no second implementation may come back', () => {
	it('scanned a non-trivial number of source files', () => {
		expect(sources.length).toBeGreaterThan(200);
	});

	it(`${MONTH_KEY_HOME} holds the only Date → "YYYY-MM" template`, () => {
		const offenders = sources.filter((s) => MONTH_KEY_TEMPLATE.test(s.text)).map((s) => s.rel);
		expect(offenders).toEqual([MONTH_KEY_HOME]);
		expect(readFileSync(path.join(ROOT, MONTH_KEY_HOME), 'utf8')).toMatch(/getUTCFullYear\(\)\}-\$\{String\(date\.getUTCMonth\(\) \+ 1\)/);
	});

	it('no source derives a month key through toISOString().slice(0, 7)', () => {
		const offenders = sources.filter((s) => ISO_MONTH_SLICE.test(s.text)).map((s) => s.rel);
		expect(offenders).toEqual([]);
	});

	it(`${MEDIAN_HOME} holds the only median definition`, () => {
		const offenders = sources.filter((s) => MEDIAN_DEFINITION.test(s.text)).map((s) => s.rel);
		expect(offenders).toEqual([MEDIAN_HOME]);
	});

	it('no other source sorts numbers and picks the middle index', () => {
		const offenders = sources.filter((s) => SORTED_MIDDLE.test(s.text)).map((s) => s.rel);
		expect(offenders).toEqual([MEDIAN_HOME]);
	});

	it.each([
		'src/lib/server/alerts.ts',
		'src/lib/server/price-deviations.ts',
		'src/lib/server/supplier-cadence.ts',
	])('%s takes median from the shared money module', (rel) => {
		const text = sources.find((s) => s.rel === rel)?.text ?? '';
		expect(text).toMatch(/import \{[^}]*\bmedian\b[^}]*\} from '\.\/money'/);
	});
});
