/**
 * Issue #808: the line-sum-vs-total reconciliation (`detectTotalMismatch` /
 * `resolveReviewState`) existed and was correct, but only ever ran inside
 * `saveReviewedInvoice` — after a human opened the review screen and
 * submitted the form. A clean-looking PDF whose lines Gemini misread could
 * sail through to `reviewState: 'revisado'` with nobody the wiser.
 *
 * These are the pure-logic tests the issue found missing: `detectTotalMismatch`
 * (line total shape as used by the save path) and `resolveReviewState`'s
 * signal composition, including the extraction-time `total_mismatch` flag
 * (now computed in extraction-worker.ts, see tests/extraction-worker.test.ts)
 * feeding into the save-time decision even when the reviewer's submitted
 * numbers happen to reconcile on their own.
 */
import { describe, it, expect } from 'vitest';
import { detectTotalMismatch, resolveReviewState, type LineFormInput } from '../src/lib/server/invoice-save';

function line(totalPriceVal: number | null): LineFormInput {
	return {
		desc: 'item', qtyFloat: null, unitPriceFloat: null, unitVal: null,
		totalPriceVal, taxRateVal: null, pack: null, supplierSku: null,
	};
}

describe('detectTotalMismatch (save-path line shape)', () => {
	it('is false when the lines sum to the total', () => {
		expect(detectTotalMismatch([line(50), line(50)], null, '100.00')).toBe(false);
	});

	it('is true when a misread line under-sums the total', () => {
		expect(detectTotalMismatch([line(50), line(30)], null, '100.00')).toBe(true);
	});

	it('accounts for tax bands on top of the line sum', () => {
		const bands = [{ rate: 0.21, base: 100, tax_amount: 21 }];
		expect(detectTotalMismatch([line(100)], bands, '121.00')).toBe(false);
		expect(detectTotalMismatch([line(100)], bands, '130.00')).toBe(true);
	});

	it('ignores blank/removed lines (null total) instead of treating them as zero mismatch causes', () => {
		expect(detectTotalMismatch([line(100), line(null)], null, '100.00')).toBe(false);
	});
});

describe('resolveReviewState', () => {
	const clean = { lowConfidenceAcked: false, totalMismatch: false, conversionNeeded: false, qrMismatch: false };

	it('is revisado when every signal is clean', () => {
		expect(resolveReviewState(clean)).toBe('revisado');
	});

	it('is incidencia when the total mismatch signal alone fires', () => {
		expect(resolveReviewState({ ...clean, totalMismatch: true })).toBe('incidencia');
	});

	it('is incidencia when any other signal fires, independent of the total mismatch', () => {
		expect(resolveReviewState({ ...clean, lowConfidenceAcked: true })).toBe('incidencia');
		expect(resolveReviewState({ ...clean, conversionNeeded: true })).toBe('incidencia');
		expect(resolveReviewState({ ...clean, qrMismatch: true })).toBe('incidencia');
	});
});

describe('resolveReviewState composition as saveReviewedInvoice wires it (issue #808)', () => {
	// Mirrors invoice-save.ts: totalMismatch = detectTotalMismatch(submitted) || extractedData?.total_mismatch === true
	function totalMismatchSignal(submittedLines: LineFormInput[], totalAmount: string | null, extractionFlag: boolean) {
		return detectTotalMismatch(submittedLines, null, totalAmount) || extractionFlag === true;
	}

	it('flags incidencia from the extraction-time signal even when the submitted (unedited) form reconciles', () => {
		// This is the exact failure mode from the issue: Gemini's own tax
		// fallback force-reconciles the numbers it hands back, so the same
		// arithmetic check recomputed on the untouched submission passes —
		// but the extraction step already knew it had to force that match.
		const submitted = [line(100)];
		const signal = totalMismatchSignal(submitted, '100.00', true);
		expect(signal).toBe(true);
		expect(resolveReviewState({ lowConfidenceAcked: false, totalMismatch: signal, conversionNeeded: false, qrMismatch: false }))
			.toBe('incidencia');
	});

	it('still catches a fresh mismatch the reviewer introduced, even without an extraction-time flag', () => {
		const submitted = [line(40)];
		const signal = totalMismatchSignal(submitted, '100.00', false);
		expect(signal).toBe(true);
	});

	it('is clean when neither the extraction nor the submitted numbers show a mismatch', () => {
		const submitted = [line(100)];
		const signal = totalMismatchSignal(submitted, '100.00', false);
		expect(signal).toBe(false);
	});
});
