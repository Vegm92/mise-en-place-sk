/**
 * The CSV spec in docs/03_features/report_templates/README.md is not cosmetic:
 * without the BOM, the `;` separator and comma decimals, Excel in Spanish opens
 * the file as a single column with broken accents. These assertions pin the
 * three rules that break silently, plus the RFC 4180 quoting that a supplier
 * name containing `;` would otherwise smuggle past the parser.
 */
import { describe, it, expect } from 'vitest';
import { toCsv, isReportType, isReportStyle, cellText, cellTone, cellKind } from '../src/lib/reports';
import { isoWeekRange, shiftIsoWeek, pctDelta, fmtPct } from '../src/lib/server/reports/shared';

describe('toCsv', () => {
	it('starts with a UTF-8 BOM', () => {
		expect(toCsv(['a'], [['x']]).charCodeAt(0)).toBe(0xfeff);
	});

	it('separates with semicolons and ends lines with CRLF', () => {
		const csv = toCsv(['a', 'b'], [['x', 'y']]);
		expect(csv.slice(1)).toBe('a;b\r\nx;y\r\n');
	});

	it('writes numbers with a comma decimal, two fixed places, no thousands separator', () => {
		const csv = toCsv(['n'], [[1234.5]], );
		expect(csv).toContain('1234,50');
		expect(csv).not.toContain('1.234');
	});

	it('quotes and escapes fields carrying the separator, quotes or newlines', () => {
		const csv = toCsv(['a'], [['Cárnicas; S.L.'], ['He said "hi"'], ['two\nlines']]);
		expect(csv).toContain('"Cárnicas; S.L."');
		expect(csv).toContain('"He said ""hi"""');
		expect(csv).toContain('"two\nlines"');
	});

	it('renders null and non-finite numbers as empty', () => {
		const csv = toCsv(['a', 'b'], [[null, Number.NaN]]);
		expect(csv.slice(1)).toBe('a;b\r\n;\r\n');
	});
});

describe('report identifiers', () => {
	it('accepts only the four types and three styles', () => {
		expect(isReportType('weekly')).toBe(true);
		expect(isReportType('quarterly')).toBe(false);
		expect(isReportType(null)).toBe(false);
		expect(isReportStyle('editorial')).toBe(true);
		expect(isReportStyle('fancy')).toBe(false);
	});
});

describe('cells', () => {
	it('reads text, tone and kind off both cell shapes', () => {
		expect(cellText('plain')).toBe('plain');
		expect(cellTone('plain')).toBeNull();
		expect(cellKind('plain')).toBeNull();
		expect(cellText({ v: '+3 %', tone: 'up' })).toBe('+3 %');
		expect(cellTone({ v: '+3 %', tone: 'up' })).toBe('up');
		expect(cellKind({ v: 'Lácteos', kind: 'cat' })).toBe('cat');
		expect(cellTone({ v: 'x' })).toBeNull();
	});
});

describe('iso week maths', () => {
	it('resolves a week to its Monday and Sunday', () => {
		expect(isoWeekRange('2026-W31')).toEqual({ start: '2026-07-27', end: '2026-08-02' });
	});

	it('walks back across a year boundary', () => {
		expect(shiftIsoWeek('2026-W02', -3)).toBe('2025-W51');
		expect(shiftIsoWeek('2026-W31', -1)).toBe('2026-W30');
	});
});

describe('deltas', () => {
	it('returns null when there is no previous value to compare against', () => {
		expect(pctDelta(100, 0)).toBeNull();
		expect(fmtPct(null)).toBe('—');
	});

	it('signs percentages and uses a comma decimal', () => {
		expect(fmtPct(pctDelta(110, 100))).toBe('+10,0 %');
		expect(fmtPct(pctDelta(90, 100))).toBe('−10,0 %');
	});
});
