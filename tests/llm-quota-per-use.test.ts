/**
 * Extraction, digest and chat each get their own bucket of the tenant's LLM
 * limits (Phase 6): a chatty tenant fills the chat bucket, not the extraction
 * one. DB-backed; skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('$lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testSql, cleanupTestRestaurant, createTestRestaurant, hasDbEnv } from './helpers/test-db';
import { checkExtractionQuota, checkLlmQuota, recordLlmUsage } from '../src/lib/server/llm-quota';

let rid = '';
const usage = { inputTokens: 1000, outputTokens: 1000, model: 'gemini-2.5-flash' };

async function spend(callerContext: string | undefined, times: number) {
	for (let i = 0; i < times; i++) await recordLlmUsage(rid, usage, callerContext);
}

beforeEach(async () => {
	if (!hasDbEnv) return;
	if (rid) await cleanupTestRestaurant(rid);
	rid = (await createTestRestaurant('llm-quota-per-use')).id;
});

afterAll(async () => {
	if (hasDbEnv) await (await import('./helpers/test-db')).closeDb();
});

describe.skipIf(!hasDbEnv)('per-use LLM quota', () => {
	async function setLimits(monthlyExtractions: number | null, monthlyCostLimitUsd: string | null) {
		await testSql`INSERT INTO tenant_llm_quotas (restaurant_id, monthly_extractions, monthly_cost_limit_usd)
			VALUES (${rid}, ${monthlyExtractions}, ${monthlyCostLimitUsd})`;
	}

	it('chat and digest calls do not count against extraction', async () => {
		await setLimits(2, null);
		await spend('chat', 5);
		await spend('weekly-digest', 5);

		expect((await checkExtractionQuota(rid)).allowed).toBe(true);
		expect((await checkLlmQuota(rid, 'extraction')).allowed).toBe(true);
	});

	it('extraction calls do not count against chat or digest', async () => {
		await setLimits(2, null);
		await spend('extraction-worker', 2);

		expect((await checkLlmQuota(rid, 'extraction')).allowed).toBe(false);
		expect((await checkLlmQuota(rid, 'chat')).allowed).toBe(true);
		expect((await checkLlmQuota(rid, 'digest')).allowed).toBe(true);
	});

	it('each use is limited by its own spend', async () => {
		await setLimits(2, null);
		await spend('chat', 2);

		expect(await checkLlmQuota(rid, 'chat')).toMatchObject({ allowed: false, reason: 'monthly_extraction_limit', used: 2 });
		expect((await checkLlmQuota(rid, 'digest')).allowed).toBe(true);
	});

	it('counts rows with no caller context and the other extraction-side callers as extraction', async () => {
		await setLimits(3, null);
		await spend(undefined, 1);
		await spend('document-structure', 1);
		await spend('categorize', 1);

		expect(await checkExtractionQuota(rid)).toMatchObject({ allowed: false, reason: 'monthly_extraction_limit', used: 3 });
	});

	it('applies the cost limit per use as well', async () => {
		await setLimits(null, '0.0001');
		await spend('chat', 1);

		expect((await checkLlmQuota(rid, 'chat')).allowed).toBe(false);
		expect((await checkLlmQuota(rid, 'extraction')).allowed).toBe(true);
	});
});
