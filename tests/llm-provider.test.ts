/**
 * estimateCostUsd — per-request LLM cost math that feeds per-tenant quota
 * enforcement (llm-quota). If this drifts, cost limits stop matching reality,
 * so the pricing table and the arithmetic are pinned here.
 *
 * Pure function, no env or network required.
 */
import { describe, it, expect } from 'vitest';
import { estimateCostUsd } from '../src/lib/server/llm-provider';

describe('estimateCostUsd', () => {
	it('prices a known model from its per-million rates', () => {
		// gemini-2.5-flash: input 0.30, output 2.50 per million tokens
		// 1_000_000 in + 1_000_000 out = 0.30 + 2.50 = 2.80
		expect(estimateCostUsd('gemini-2.5-flash', 1_000_000, 1_000_000)).toBeCloseTo(2.8, 10);
	});

	it('scales linearly with token counts', () => {
		const one = estimateCostUsd('gemini-2.5-flash', 1000, 500);
		const two = estimateCostUsd('gemini-2.5-flash', 2000, 1000);
		expect(two).toBeCloseTo(one * 2, 12);
	});

	it('returns 0 for zero tokens', () => {
		expect(estimateCostUsd('gemini-2.5-flash', 0, 0)).toBe(0);
	});

	it('uses the cheaper flash-lite rates for that model', () => {
		// 0.10 in + 0.40 out per million
		expect(estimateCostUsd('gemini-2.5-flash-lite', 1_000_000, 0)).toBeCloseTo(0.10, 10);
		expect(estimateCostUsd('gemini-2.5-flash-lite', 0, 1_000_000)).toBeCloseTo(0.40, 10);
	});

	it('prices gemini-2.5-pro at its higher output rate', () => {
		// 1.25 in + 10.00 out per million
		expect(estimateCostUsd('gemini-2.5-pro', 0, 1_000_000)).toBeCloseTo(10.0, 10);
	});

	it('falls back to default rates for an unknown model', () => {
		// default { input: 0.075, output: 0.30 }
		const fallback = estimateCostUsd('totally-made-up-model', 1_000_000, 1_000_000);
		expect(fallback).toBeCloseTo(0.075 + 0.30, 10);
	});

	it('counts input and output independently', () => {
		const inputOnly  = estimateCostUsd('gemini-2.5-flash', 1_000_000, 0);
		const outputOnly = estimateCostUsd('gemini-2.5-flash', 0, 1_000_000);
		expect(inputOnly).toBeCloseTo(0.30, 10);
		expect(outputOnly).toBeCloseTo(2.50, 10);
		expect(estimateCostUsd('gemini-2.5-flash', 1_000_000, 1_000_000))
			.toBeCloseTo(inputOnly + outputOnly, 10);
	});

	it('produces a small but non-zero cost for a realistic extraction', () => {
		// ~4k in, ~1k out on flash — should be a fraction of a cent
		const cost = estimateCostUsd('gemini-2.5-flash', 4000, 1000);
		expect(cost).toBeGreaterThan(0);
		expect(cost).toBeLessThan(0.01);
	});
});
