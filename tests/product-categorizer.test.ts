/**
 * Tests for the product categorisation job (Phase 1 of "spend category: from
 * the supplier to the line").
 *
 * Before this job existed, `products.category` had no source of its own: a
 * product was created carrying the category of whichever supplier happened to
 * deliver it first, and `ON CONFLICT … DO UPDATE SET name_key = products.name_key`
 * meant it was never refreshed. Moving spend attribution onto the line would
 * have been close to a no-op, because the product only ever echoed the supplier.
 *
 * The job gives the catalogue its own verdict. Two rules make it safe to run
 * over an entire catalogue unattended:
 *   - a verdict the taxonomy floor rejects (low confidence, an invented or
 *     translated category) leaves the product NULL — visibly "uncategorised"
 *     on /products — rather than stamping it 'Other', which would be
 *     indistinguishable from a real judgement;
 *   - it only ever fills a NULL, so a category a human chose is never
 *     overwritten.
 *
 * Prompt/parse tests run anywhere; the orchestration tests are DB-backed with
 * a fake LLM provider, so no real Gemini call is made. Skipped without
 * DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import {
	buildCategorizePrompt, parseCategorizeResponse, processCategorizeJob,
} from '../src/lib/server/products';
import type { createGeminiProvider } from '../src/lib/server/llm-provider';
type LLMProvider = ReturnType<typeof createGeminiProvider>;
import { MIN_CATEGORY_CONFIDENCE, VALID_CATEGORIES } from '../src/lib/constants';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';

// ── Pure ──────────────────────────────────────────────────────────────────────

describe('buildCategorizePrompt', () => {
	it('names the product and fences the permitted values', () => {
		const p = buildCategorizePrompt('Tomate pera');
		expect(p).toContain('Tomate pera');
		expect(p).toContain('<<<CATEGORY_VALUES>>>');
		expect(p).toContain('<<<END_CATEGORY_VALUES>>>');
	});

	it('offers every category in the taxonomy except the uncategorised bucket', () => {
		const p = buildCategorizePrompt('Tomate pera');
		for (const cat of VALID_CATEGORIES) {
			if (cat === 'Other') continue;
			expect(p, `missing "${cat}"`).toContain(cat);
		}
	});

	it('tells the model to judge the product, not the seller', () => {
		expect(buildCategorizePrompt('Tomate pera')).toContain('no quién lo vende');
	});
});

describe('parseCategorizeResponse', () => {
	it('accepts a canonical category', () => {
		expect(parseCategorizeResponse('{"category": "Lácteos", "confidence": 0.9}')).toBe('Lácteos');
	});

	it('accepts a fenced JSON block', () => {
		expect(parseCategorizeResponse('```json\n{"category": "Bebidas", "confidence": 0.9}\n```'))
			.toBe('Bebidas');
	});

	it('canonicalises case and missing accents through the taxonomy floor', () => {
		expect(parseCategorizeResponse('{"category": "lacteos", "confidence": 0.9}')).toBe('Lácteos');
	});

	it('returns null rather than a verdict the model is unsure about', () => {
		const low = MIN_CATEGORY_CONFIDENCE - 0.01;
		expect(parseCategorizeResponse(`{"category": "Bebidas", "confidence": ${low}}`)).toBeNull();
	});

	it('returns null for an invented or translated category', () => {
		expect(parseCategorizeResponse('{"category": "Ferretería", "confidence": 0.9}')).toBeNull();
		expect(parseCategorizeResponse('{"category": "Dairy", "confidence": 0.9}')).toBeNull();
	});

	it('returns null for an explicit "Other", for null, and for junk', () => {
		expect(parseCategorizeResponse('{"category": "Other", "confidence": 0.9}')).toBeNull();
		expect(parseCategorizeResponse('{"category": null, "confidence": 0.9}')).toBeNull();
		expect(parseCategorizeResponse('not json at all')).toBeNull();
	});
});

// ── Orchestration ─────────────────────────────────────────────────────────────

function fakeProvider(text: string): LLMProvider {
	return {
		model: 'test-model',
		generate: async () => ({ text, usage: { inputTokens: 10, outputTokens: 5, model: 'test-model' } }),
	};
}

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('categorizer')).id;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM products WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

async function seedProduct(name: string, category: string | null): Promise<number> {
	const [row] = await testSql`
		INSERT INTO products (restaurant_id, canonical_name, name_key, category)
		VALUES (${rid}, ${name}, ${name.toLowerCase()}, ${category})
		RETURNING id
	`;
	return Number(row.id);
}

async function categoryOf(productId: number): Promise<string | null> {
	const [row] = await testSql`SELECT category FROM products WHERE id = ${productId}`;
	return (row?.category as string | null) ?? null;
}

describe.skipIf(!hasDbEnv)('processCategorizeJob', () => {
	it('writes a confident verdict onto the product and records usage', async () => {
		const id = await seedProduct('Tomate pera', null);
		const recordUsage = vi.fn(async () => {});
		await processCategorizeJob(
			{ restaurantId: rid, productId: id, canonicalName: 'Tomate pera' },
			{ provider: fakeProvider('{"category": "Frutas y Verduras", "confidence": 0.92}'), recordUsage },
		);

		expect(await categoryOf(id)).toBe('Frutas y Verduras');
		expect(recordUsage).toHaveBeenCalledOnce();
	});

	it('leaves the product uncategorised rather than stamping it "Other"', async () => {
		const id = await seedProduct('Artículo 4471', null);
		await processCategorizeJob(
			{ restaurantId: rid, productId: id, canonicalName: 'Artículo 4471' },
			{ provider: fakeProvider('{"category": null, "confidence": 0.2}'), recordUsage: vi.fn(async () => {}) },
		);

		expect(await categoryOf(id)).toBeNull();
	});

	it('never overwrites a category that is already set', async () => {
		const id = await seedProduct('Tomate pera', 'Congelados');
		const recordUsage = vi.fn(async () => {});
		await processCategorizeJob(
			{ restaurantId: rid, productId: id, canonicalName: 'Tomate pera' },
			{ provider: fakeProvider('{"category": "Frutas y Verduras", "confidence": 0.99}'), recordUsage },
		);

		expect(await categoryOf(id)).toBe('Congelados');
		expect(recordUsage, 'no LLM call for a product that needs no verdict').not.toHaveBeenCalled();
	});

	it('does not reach across tenants', async () => {
		const other = await createTestRestaurant('categorizer-other');
		try {
			const id = await seedProduct('Tomate pera', null);
			await processCategorizeJob(
				{ restaurantId: other.id, productId: id, canonicalName: 'Tomate pera' },
				{ provider: fakeProvider('{"category": "Frutas y Verduras", "confidence": 0.99}'), recordUsage: vi.fn(async () => {}) },
			);
			expect(await categoryOf(id)).toBeNull();
		} finally {
			await cleanupTestRestaurant(other.id);
		}
	});

	it('dead-letters a provider failure instead of throwing', async () => {
		const id = await seedProduct('Tomate pera', null);
		const recordFailure = vi.fn(async () => null);
		const exploding: LLMProvider = {
			model: 'test-model',
			generate: async () => { throw new Error('gemini down'); },
		};

		await expect(processCategorizeJob(
			{ restaurantId: rid, productId: id, canonicalName: 'Tomate pera' },
			{ provider: exploding, recordUsage: vi.fn(async () => {}), recordFailure },
		)).resolves.toBeUndefined();

		expect(recordFailure).toHaveBeenCalledOnce();
		expect(await categoryOf(id)).toBeNull();
	});
});
