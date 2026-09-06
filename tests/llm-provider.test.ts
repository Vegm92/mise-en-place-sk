/**
 * estimateCostUsd — per-request LLM cost math that feeds per-tenant quota
 * enforcement (llm-quota). If this drifts, cost limits stop matching reality,
 * so the pricing table and the arithmetic are pinned here.
 *
 * Pure function, no env or network required.
 *
 * generate() — issue #842: a response schema, when passed, must be forwarded
 * to the SDK as responseMimeType + responseSchema so Gemini decodes against a
 * contract instead of us repairing free-text JSON by hand.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
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

describe('createGeminiProvider().generate — response schema forwarding (issue #842)', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
		vi.doUnmock('@google/genai');
	});

	type MockGenerateContentRequest = { config?: { responseMimeType?: string; responseSchema?: unknown } };

	async function mockGeminiSdk(responseText: string) {
		const generateContentMock = vi.fn(async (_req: MockGenerateContentRequest) => ({
			text: responseText,
			usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
		}));
		vi.doMock('@google/genai', () => ({
			GoogleGenAI: vi.fn().mockImplementation(() => ({
				models: { generateContent: generateContentMock },
			})),
			Type: { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER' },
		}));
		vi.stubEnv('GEMINI_API_KEY', 'test-key');
		vi.resetModules();
		const { createGeminiProvider } = await import('../src/lib/server/llm-provider');
		return { generateContentMock, createGeminiProvider };
	}

	it('forwards responseSchema as responseMimeType + responseSchema in the request config', async () => {
		const { generateContentMock, createGeminiProvider } = await mockGeminiSdk('{}');
		const schema = { type: 'OBJECT', properties: { a: { type: 'STRING' } } } as never;
		const provider = createGeminiProvider();
		await provider.generate('hello', undefined, undefined, schema);

		expect(generateContentMock).toHaveBeenCalledOnce();
		const call = generateContentMock.mock.calls[0]![0];
		expect(call.config?.responseMimeType).toBe('application/json');
		expect(call.config?.responseSchema).toBe(schema);
	});

	it('omits responseMimeType/responseSchema entirely when no schema is passed', async () => {
		const { generateContentMock, createGeminiProvider } = await mockGeminiSdk('plain text');
		const provider = createGeminiProvider();
		await provider.generate('hello');

		const call = generateContentMock.mock.calls[0]![0];
		expect(call.config).toBeUndefined();
	});
});
