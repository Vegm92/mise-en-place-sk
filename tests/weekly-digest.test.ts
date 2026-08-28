/**
 * #426 — the weekly digest (`weekly-digest.ts`) bypassed the LLM provider
 * seam: it built its own `GoogleGenAI` client, read `GEMINI_MODEL` directly,
 * and discarded `response.usageMetadata`, so digest tokens never reached
 * `llm_usage_log` despite shipping a full `buildChatContext` snapshot per
 * tenant per week.
 *
 * These pin the fix: `getOrGenerateWeeklyDigest` now calls
 * `createGeminiProvider().generate()` and records usage with
 * `recordLlmUsage(restaurantId, usage, 'weekly-digest')`, mirroring how
 * extraction and product normalization record theirs — injected via the same
 * `deps.provider` / `deps.recordUsage` pattern as `processNormalizeJob`.
 * DB-backed against local Postgres. Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import { getOrGenerateWeeklyDigest, type WeeklyDigestDeps } from '../src/lib/server/weekly-digest';
import type { createGeminiProvider } from '../src/lib/server/llm-provider';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';

type LLMProvider = ReturnType<typeof createGeminiProvider>;

function fakeProvider(text: string, usage = { inputTokens: 300, outputTokens: 90, model: 'test-digest-model' }): LLMProvider {
	return { model: usage.model, generate: async () => ({ text, usage }) };
}

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('weekly-digest');
	rid = r.id;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM llm_usage_log WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM settings WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('getOrGenerateWeeklyDigest — #426 provider seam + usage logging', () => {
	it('generates via the injected provider and records usage with source "weekly-digest"', async () => {
		const recordUsage = vi.fn(async () => {});
		const deps: WeeklyDigestDeps = { provider: fakeProvider('Gasto estable. Recommended: nada.'), recordUsage };

		const text = await getOrGenerateWeeklyDigest(rid, '2026-W35', deps);

		expect(text).toBe('Gasto estable. Recommended: nada.');
		expect(recordUsage).toHaveBeenCalledTimes(1);
		expect(recordUsage).toHaveBeenCalledWith(
			rid,
			{ inputTokens: 300, outputTokens: 90, model: 'test-digest-model' },
			'weekly-digest',
		);
	});

	it('flows the real usageMetadata-derived token counts into llm_usage_log', async () => {
		const { recordLlmUsage } = await import('../src/lib/server/llm-quota');
		const deps: WeeklyDigestDeps = {
			provider: fakeProvider('Digest text.', { inputTokens: 555, outputTokens: 77, model: 'gemini-digest' }),
			recordUsage: recordLlmUsage,
		};

		await getOrGenerateWeeklyDigest(rid, '2026-W36', deps);

		const rows = await testSql`
			SELECT restaurant_id, model, input_tokens, output_tokens, caller_context
			FROM llm_usage_log WHERE restaurant_id = ${rid}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].restaurant_id).toBe(rid);
		expect(rows[0].model).toBe('gemini-digest');
		expect(rows[0].input_tokens).toBe(555);
		expect(rows[0].output_tokens).toBe(77);
		expect(rows[0].caller_context).toBe('weekly-digest');
	});

	it('a cache hit (same stored week) never calls the provider or records usage again', async () => {
		const firstDeps: WeeklyDigestDeps = { provider: fakeProvider('First digest.'), recordUsage: vi.fn(async () => {}) };
		await getOrGenerateWeeklyDigest(rid, '2026-W37', firstDeps);

		const secondGenerate = vi.fn();
		const secondRecordUsage = vi.fn(async () => {});
		const text = await getOrGenerateWeeklyDigest(rid, '2026-W37', {
			provider: { model: 'unused', generate: secondGenerate },
			recordUsage: secondRecordUsage,
		});

		expect(text).toBe('First digest.');
		expect(secondGenerate).not.toHaveBeenCalled();
		expect(secondRecordUsage).not.toHaveBeenCalled();
	});

	it('a provider failure rolls back the claimed week and records no usage', async () => {
		const failingDeps: WeeklyDigestDeps = {
			provider: { model: 'x', generate: async () => { throw new Error('gemini down'); } },
			recordUsage: vi.fn(async () => {}),
		};

		const text = await getOrGenerateWeeklyDigest(rid, '2026-W38', failingDeps);

		expect(text).toBeNull();
		expect(failingDeps.recordUsage).not.toHaveBeenCalled();
		const rows = await testSql`SELECT id FROM llm_usage_log WHERE restaurant_id = ${rid}`;
		expect(rows).toHaveLength(0);
	});
});
