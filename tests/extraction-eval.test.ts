import { describe, it, expect } from 'vitest';
import { overallRate, checkRegression, type EvalReport } from '../src/extraction-eval';
import type { FieldAgreement } from '../src/lib/server/extraction-corpus';

function agreement(field: string, rate: number | null): FieldAgreement {
	return { field: field as FieldAgreement['field'], compared: 10, matched: rate == null ? 0 : Math.round(rate / 10), rate };
}

function report(overrides: Partial<EvalReport> = {}): EvalReport {
	return {
		pipelineVersion: 'pipeline-test',
		generatedAt: new Date().toISOString(),
		documents: 10,
		overallRate: 90,
		fields: [agreement('total_amount', 90), agreement('supplier_name', 90)],
		criticalFailures: [],
		...overrides,
	};
}

describe('overallRate', () => {
	it('averages the per-field rates', () => {
		expect(overallRate([agreement('a', 100), agreement('b', 80)])).toBe(90);
	});

	it('ignores fields with no comparisons', () => {
		expect(overallRate([agreement('a', 100), agreement('b', null)])).toBe(100);
	});

	it('returns null when nothing was compared', () => {
		expect(overallRate([agreement('a', null)])).toBeNull();
	});
});

describe('checkRegression', () => {
	it('passes when nothing regressed', () => {
		expect(checkRegression(report(), report())).toEqual([]);
	});

	it('flags any critical-field mismatch regardless of overall rate', () => {
		const candidate = report({
			criticalFailures: [{ id: 'vinals-3770', field: 'total_amount', expected: 293.19, actual: 293.9 }],
		});
		const failures = checkRegression(candidate, report());
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('vinals-3770/total_amount');
	});

	it('flags an overall-rate drop beyond tolerance', () => {
		const baseline = report({ overallRate: 90 });
		const candidate = report({ overallRate: 88 });
		expect(checkRegression(candidate, baseline)).toEqual([
			"overall agreement dropped from 90% to 88% (tolerance 1pt)",
		]);
	});

	it('tolerates a small overall-rate dip within tolerance', () => {
		const baseline = report({ overallRate: 90 });
		const candidate = report({ overallRate: 89.5 });
		expect(checkRegression(candidate, baseline)).toEqual([]);
	});

	it('flags a per-field regression even when the overall rate holds', () => {
		const baseline = report({
			overallRate: 90,
			fields: [agreement('total_amount', 95), agreement('supplier_name', 85)],
		});
		const candidate = report({
			overallRate: 90,
			fields: [agreement('total_amount', 85), agreement('supplier_name', 95)],
		});
		const failures = checkRegression(candidate, baseline);
		expect(failures).toEqual(["field 'total_amount' agreement dropped from 95% to 85%"]);
	});
});
