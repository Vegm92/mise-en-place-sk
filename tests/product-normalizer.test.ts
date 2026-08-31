/**
 * Tests for LLM product normalization (issue #300, Phase 4).
 *
 * Pure prompt/parse tests run anywhere; the orchestration test is DB-backed
 * (db swapped for the test client) and injects a fake LLM provider so no real
 * Gemini call is made. Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import {
	buildNormalizePrompt, parseNormalizeResponse, processNormalizeJob, LLM_MATCH_THRESHOLD,
} from '../src/lib/server/products';
import type { createGeminiProvider } from '../src/lib/server/llm-provider';
type LLMProvider = ReturnType<typeof createGeminiProvider>;
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { makeSchemaCapturingGenerate } from './helpers/schema-capturing-generate';

// ── Pure ──────────────────────────────────────────────────────────────────────

describe('buildNormalizePrompt', () => {
	it('lists candidates as "id: name" and asks for strict JSON', () => {
		const p = buildNormalizePrompt('MERL. GRANDE', [{ id: 7, name: 'Merluza' }, { id: 9, name: 'Bacalao' }]);
		expect(p).toContain('MERL. GRANDE');
		expect(p).toContain('7: Merluza');
		expect(p).toContain('9: Bacalao');
		expect(p).toContain('match_id');
	});
});

describe('parseNormalizeResponse', () => {
	const valid = new Set([7, 9]);
	it('parses a plain JSON object', () => {
		expect(parseNormalizeResponse('{"match_id": 7, "confidence": 0.9}', valid)).toEqual({ matchId: 7, confidence: 0.9 });
	});
	it('strips ```json fences', () => {
		expect(parseNormalizeResponse('```json\n{"match_id": 9, "confidence": 0.8}\n```', valid)).toEqual({ matchId: 9, confidence: 0.8 });
	});
	it('rejects an id not among the candidates', () => {
		expect(parseNormalizeResponse('{"match_id": 42, "confidence": 0.9}', valid)).toEqual({ matchId: null, confidence: 0.9 });
	});
	it('handles null match and clamps confidence', () => {
		expect(parseNormalizeResponse('{"match_id": null, "confidence": 5}', valid)).toEqual({ matchId: null, confidence: 1 });
	});
	it('returns a safe default on garbage', () => {
		expect(parseNormalizeResponse('not json', valid)).toEqual({ matchId: null, confidence: 0 });
	});
	it('returns a safe default on well-formed JSON of the wrong shape (issue #842)', () => {
		expect(parseNormalizeResponse('[1, 2, 3]', valid)).toEqual({ matchId: null, confidence: 0 });
	});
});

// ── Orchestration ─────────────────────────────────────────────────────────────

function fakeProvider(text: string): LLMProvider {
	return { model: 'test-model', generate: async () => ({ text, usage: { inputTokens: 10, outputTokens: 5, model: 'test-model' } }) };
}

let rid = '';
let merluzaId = 0;
let throwawayId = 0;

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('normalizer');
	rid = r.id;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM system_notifications WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM products WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

async function seedProducts() {
	const [m] = await testSql`INSERT INTO products (restaurant_id, canonical_name, name_key) VALUES (${rid}, 'Merluza', 'merluza') RETURNING id`;
	const [t] = await testSql`INSERT INTO products (restaurant_id, canonical_name, name_key) VALUES (${rid}, 'MERL. GRANDE', 'merl grande') RETURNING id`;
	merluzaId = m.id; throwawayId = t.id;
}

describe.skipIf(!hasDbEnv)('processNormalizeJob', () => {
	it('writes a pending llm suggestion for a confident match and records usage', async () => {
		await seedProducts();
		const recordUsage = vi.fn(async () => {});
		await processNormalizeJob(
			{ restaurantId: rid, productId: throwawayId, rawText: 'MERL. GRANDE' },
			{ provider: fakeProvider(`{"match_id": ${merluzaId}, "confidence": 0.95}`), recordUsage },
		);

		const notifs = await testSql`
			SELECT payload FROM system_notifications
			WHERE restaurant_id = ${rid} AND notification_type = 'product_suggestion' AND status = 'pending'`;
		expect(notifs).toHaveLength(1);
		const payload = notifs[0].payload;
		expect(payload.source).toBe('llm');
		expect(payload.candidateProductId).toBe(merluzaId);
		expect(payload.description).toBe('MERL. GRANDE');
		expect(recordUsage).toHaveBeenCalledWith(rid, expect.anything(), 'normalize');
	});

	it('does not suggest below the confidence threshold', async () => {
		await seedProducts();
		await processNormalizeJob(
			{ restaurantId: rid, productId: throwawayId, rawText: 'MERL. GRANDE' },
			{ provider: fakeProvider(`{"match_id": ${merluzaId}, "confidence": ${LLM_MATCH_THRESHOLD - 0.2}}`), recordUsage: vi.fn(async () => {}) },
		);
		const [{ count }] = await testSql`SELECT COUNT(*)::int AS count FROM system_notifications WHERE restaurant_id = ${rid}`;
		expect(count).toBe(0);
	});

	it('does not suggest when the LLM returns no match', async () => {
		await seedProducts();
		await processNormalizeJob(
			{ restaurantId: rid, productId: throwawayId, rawText: 'MERL. GRANDE' },
			{ provider: fakeProvider('{"match_id": null, "confidence": 0.9}'), recordUsage: vi.fn(async () => {}) },
		);
		const [{ count }] = await testSql`SELECT COUNT(*)::int AS count FROM system_notifications WHERE restaurant_id = ${rid}`;
		expect(count).toBe(0);
	});

	it('dedups: a second run while one suggestion is pending adds nothing', async () => {
		await seedProducts();
		const deps = { provider: fakeProvider(`{"match_id": ${merluzaId}, "confidence": 0.95}`), recordUsage: vi.fn(async () => {}) };
		await processNormalizeJob({ restaurantId: rid, productId: throwawayId, rawText: 'MERL. GRANDE' }, deps);
		await processNormalizeJob({ restaurantId: rid, productId: throwawayId, rawText: 'MERL. GRANDE' }, deps);
		const [{ count }] = await testSql`SELECT COUNT(*)::int AS count FROM system_notifications WHERE restaurant_id = ${rid}`;
		expect(count).toBe(1);
	});

	it('passes a JSON response schema to provider.generate (issue #842)', async () => {
		await seedProducts();
		const generate = makeSchemaCapturingGenerate('{"match_id": null, "confidence": 0}');
		await processNormalizeJob(
			{ restaurantId: rid, productId: throwawayId, rawText: 'MERL. GRANDE' },
			{ provider: { model: 'test-model', generate }, recordUsage: vi.fn(async () => {}) },
		);
		expect(generate).toHaveBeenCalledOnce();
		const [, , , schema] = generate.mock.calls[0];
		expect(schema).toMatchObject({ type: 'OBJECT' });
	});
});
