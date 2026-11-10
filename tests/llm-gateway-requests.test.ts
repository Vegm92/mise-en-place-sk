import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ generateContent: vi.fn(), get: vi.fn() }));

vi.mock('@google/genai', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@google/genai')>();
	return {
		...actual,
		GoogleGenAI: vi.fn(function () {
			return { models: { generateContent: sdk.generateContent, get: sdk.get } };
		}),
	};
});

vi.mock('../src/lib/server/env', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/lib/server/env')>()),
	GEMINI_API_KEY: 'test-key',
	GEMINI_MODEL: 'gemini-test-model',
}));

import { extractWithProvider, INVOICE_RESPONSE_SCHEMA } from '../src/lib/server/extract';
import {
	classifyPdfWithVision,
	STRUCTURE_PROMPT,
	STRUCTURE_RESPONSE_SCHEMA,
} from '../src/lib/server/document-structure';
import { createGeminiProvider, describeGeminiModel } from '../src/lib/server/llm-provider';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const dir = mkdtempSync(path.join(tmpdir(), 'llm-gateway-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const OK = { text: '{}', usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };

type Request = {
	model: string;
	contents: unknown;
	config: { abortSignal?: AbortSignal; systemInstruction?: string; responseMimeType?: string; responseSchema?: unknown };
};

beforeEach(() => {
	sdk.generateContent.mockReset();
	sdk.get.mockReset();
});

describe('extract.ts request through the gateway', () => {
	it('sends the same model, prompt, schema and contents as before the gateway move', async () => {
		const file = path.join(dir, 'invoice.jpg');
		writeFileSync(file, Buffer.from('fake-image-bytes'));
		sdk.generateContent.mockResolvedValue({ ...OK, text: JSON.stringify({ supplier_name: 'x' }) });

		await extractWithProvider(file, createGeminiProvider()).catch(() => undefined);

		expect(sdk.generateContent).toHaveBeenCalledOnce();
		const req = sdk.generateContent.mock.calls[0]![0] as Request;
		expect(req.model).toBe('gemini-test-model');
		expect(req.contents).toEqual([
			{ role: 'user', parts: [{ inlineData: { data: Buffer.from('fake-image-bytes').toString('base64'), mimeType: 'image/jpeg' } }] },
		]);
		expect(req.config.responseMimeType).toBe('application/json');
		expect(req.config.responseSchema).toBe(INVOICE_RESPONSE_SCHEMA);
		expect(sha(req.config.responseSchema)).toBe('144a9dd10b3d0bce4ebab62b21681da2cf2609155b73436380568a239b77097b');
		expect(sha(req.config.systemInstruction)).toBe('f0b6d486efade15981c283f3b1f538f823b56c79a48213cdb70120ed09ed2f31');
	});
});

describe('document-structure.ts request through the gateway', () => {
	it('sends the same model, prompt, schema and contents as before the gateway move', async () => {
		sdk.generateContent.mockResolvedValue({ ...OK, text: JSON.stringify({ pages: [] }) });
		const provider = createGeminiProvider();
		const generate = async (...args: Parameters<typeof provider.generate>) => (await provider.generate(...args)).text;
		const buf = Buffer.from('%PDF-fake');

		await classifyPdfWithVision(buf, 2, generate).catch(() => undefined);

		expect(sdk.generateContent).toHaveBeenCalledOnce();
		const req = sdk.generateContent.mock.calls[0]![0] as Request;
		expect(req.model).toBe('gemini-test-model');
		expect(req.contents).toEqual([
			{ role: 'user', parts: [{ inlineData: { data: buf.toString('base64'), mimeType: 'application/pdf' } }] },
		]);
		expect(req.config.systemInstruction).toBe(STRUCTURE_PROMPT);
		expect(req.config.responseMimeType).toBe('application/json');
		expect(req.config.responseSchema).toBe(STRUCTURE_RESPONSE_SCHEMA);
		expect(sha(req.config.responseSchema)).toBe('83ac5179f3ced6e9a74b908c046f0da8955e5c8c9bc22564188b553e981050bf');
		expect(sha(req.config.systemInstruction)).toBe('46f531fdc6e44f15e68abfa90d451d1fefc5608fd721d5747615291449849155');
	});
});

describe('external-probes.ts request through the gateway', () => {
	it('asks the SDK for the configured model', async () => {
		sdk.get.mockResolvedValue({ name: 'models/gemini-test-model' });

		await expect(describeGeminiModel()).resolves.toBe('models/gemini-test-model reachable');
		expect(sdk.get).toHaveBeenCalledWith({ model: 'gemini-test-model' });
	});
});
