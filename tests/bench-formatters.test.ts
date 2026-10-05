import { describe, it, expect } from 'vitest';
import { fmtEur, fmtEurCompact, formatYoyPct, type Locale } from '../src/lib/formatters';

const EUR_OPTS: Intl.NumberFormatOptions = { style: 'currency', currency: 'EUR' };
const EUR_COMPACT_OPTS: Intl.NumberFormatOptions = { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 };
const YOY_OPTS: Intl.NumberFormatOptions = { maximumFractionDigits: 1, signDisplay: 'exceptZero' };

const eurFormatters: Record<Locale, Intl.NumberFormat> = {
	es: new Intl.NumberFormat('es-ES', EUR_OPTS),
	en: new Intl.NumberFormat('en-GB', EUR_OPTS),
};

const eurCompactFormatters: Record<Locale, Intl.NumberFormat> = {
	es: new Intl.NumberFormat('es-ES', EUR_COMPACT_OPTS),
	en: new Intl.NumberFormat('en-GB', EUR_COMPACT_OPTS),
};

const yoyFormatters: Record<Locale, Intl.NumberFormat> = {
	es: new Intl.NumberFormat('es-ES', YOY_OPTS),
	en: new Intl.NumberFormat('en-GB', YOY_OPTS),
};

function unmemoFmtEur(n: number, locale: Locale = 'es'): string {
	const fmtInst = eurFormatters[locale] ?? eurFormatters.es;
	return fmtInst.format(n);
}

function unmemoFmtEurCompact(n: number, locale: Locale = 'es'): string {
	const fmtInst = eurCompactFormatters[locale] ?? eurCompactFormatters.es;
	return fmtInst.format(Math.round(n));
}

function unmemoFormatYoyPct(pct: number | null, locale: Locale = 'es'): string {
	if (pct === null || !Number.isFinite(pct)) return '—';
	const fmtInst = yoyFormatters[locale] ?? yoyFormatters.es;
	return fmtInst.format(pct) + ' %';
}

describe('Formatters Benchmark & Verification', () => {
	it('produces identical outputs to unmemoized implementation', () => {
		const testValues = [0, 10, -50, 1234.56, 99.99, null, NaN, Infinity];
		for (const v of testValues) {
			if (typeof v === 'number') {
				expect(fmtEur(v, 'es')).toBe(unmemoFmtEur(v, 'es'));
				expect(fmtEur(v, 'en')).toBe(unmemoFmtEur(v, 'en'));
				expect(fmtEurCompact(v, 'es')).toBe(unmemoFmtEurCompact(v, 'es'));
				expect(fmtEurCompact(v, 'en')).toBe(unmemoFmtEurCompact(v, 'en'));
			}
			expect(formatYoyPct(v, 'es')).toBe(unmemoFormatYoyPct(v, 'es'));
			expect(formatYoyPct(v, 'en')).toBe(unmemoFormatYoyPct(v, 'en'));
		}
	});

	it('quantifies performance speedup across 300,000 iterations', () => {
		const iterations = 300000;
		const dataset: number[] = [];
		for (let i = 0; i < iterations; i++) {
			dataset.push((i % 500) / 10);
		}

		const startUnmemo = performance.now();
		for (let i = 0; i < iterations; i++) {
			const v = dataset[i]!;
			unmemoFmtEur(v, 'es');
			unmemoFmtEurCompact(v, 'es');
			unmemoFormatYoyPct(v, 'es');
		}
		const timeUnmemo = performance.now() - startUnmemo;

		const startMemo = performance.now();
		for (let i = 0; i < iterations; i++) {
			const v = dataset[i]!;
			fmtEur(v, 'es');
			fmtEurCompact(v, 'es');
			formatYoyPct(v, 'es');
		}
		const timeMemo = performance.now() - startMemo;

		const speedup = timeUnmemo / timeMemo;
		console.log(`[UNMEMOIZED] 300k formatting iterations: ${timeUnmemo.toFixed(2)}ms`);
		console.log(`[MEMOIZED] 300k formatting iterations: ${timeMemo.toFixed(2)}ms`);
		console.log(`[SPEEDUP] ${speedup.toFixed(2)}x speedup!`);

		expect(speedup).toBeGreaterThan(1.5);
	});
});
