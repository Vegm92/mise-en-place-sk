import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractionFixturesEnabled } from '../src/lib/server/env';
import { fixtureInvoiceJson, FIXTURE_EXTRACTION_MODEL } from '../src/lib/server/extraction-fixtures';

const GOLDEN = path.resolve('tests/golden');
const CASE_ID = 'synthetic-facturae-001';
const CASE_INPUT = path.join(GOLDEN, 'cases', CASE_ID, 'invoice.xml');

function scratchFile(name: string, content: string | Buffer): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'mep-fixture-'));
	const file = path.join(dir, name);
	writeFileSync(file, content);
	return file;
}

describe('extractionFixturesEnabled', () => {
	it('is on only with EXTRACTION_FIXTURES=1 outside production', () => {
		expect(extractionFixturesEnabled({ EXTRACTION_FIXTURES: '1', NODE_ENV: 'development' })).toBe(true);
		expect(extractionFixturesEnabled({ EXTRACTION_FIXTURES: '1', NODE_ENV: 'test' })).toBe(true);
		expect(extractionFixturesEnabled({ EXTRACTION_FIXTURES: '0', NODE_ENV: 'development' })).toBe(false);
		expect(extractionFixturesEnabled({ NODE_ENV: 'development' })).toBe(false);
	});

	it('ignores the flag in production and when NODE_ENV is unset', () => {
		expect(extractionFixturesEnabled({ EXTRACTION_FIXTURES: '1', NODE_ENV: 'production' })).toBe(false);
		expect(extractionFixturesEnabled({ EXTRACTION_FIXTURES: '1' })).toBe(false);
	});
});

describe('fixtureInvoiceJson', () => {
	it('matches a golden case by content hash', () => {
		const file = scratchFile('renamed.xml', readFileSync(CASE_INPUT));
		const invoice = JSON.parse(fixtureInvoiceJson(file, GOLDEN));
		expect(invoice.invoice_number).toBe('FAC-2024-001');
		expect(invoice.total_amount).toBe(1452.2);
		expect(typeof invoice.confidence).toBe('number');
	});

	it('matches a golden case by filename stem', () => {
		const file = scratchFile(`${CASE_ID}_ab12cd.pdf`, '%PDF-1.4 unrelated bytes');
		expect(JSON.parse(fixtureInvoiceJson(file, GOLDEN)).invoice_number).toBe('FAC-2024-001');
	});

	it('falls back to a deterministic default derived from a golden case', () => {
		const a = scratchFile('albaran.jpg', 'bytes-a');
		const b = scratchFile('albaran.jpg', 'bytes-b');
		const first = JSON.parse(fixtureInvoiceJson(a, GOLDEN));
		expect(first.supplier_name).toBe('Distribuciones Alimentarias S.L.');
		expect(first.invoice_number).toMatch(/^FAC-2024-001-[0-9a-f]{6}$/);
		expect(fixtureInvoiceJson(a, GOLDEN)).toBe(fixtureInvoiceJson(a, GOLDEN));
		expect(JSON.parse(fixtureInvoiceJson(b, GOLDEN)).invoice_number).not.toBe(first.invoice_number);
	});
});

describe('extractWithProvider with EXTRACTION_FIXTURES', () => {
	afterEach(() => {
		vi.doUnmock('../src/lib/server/llm-provider');
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function loadExtract(nodeEnv: string) {
		vi.stubEnv('EXTRACTION_FIXTURES', '1');
		vi.stubEnv('NODE_ENV', nodeEnv);
		vi.resetModules();
		return import('../src/lib/server/extract');
	}

	it('returns a sanitized fixture with zero-cost fixture usage', async () => {
		const { extractWithProvider } = await loadExtract('development');
		const file = scratchFile(`${CASE_ID}_ab12cd.png`, 'png-bytes');
		const { invoice, usage } = await extractWithProvider(file);
		expect(usage).toEqual({ inputTokens: 0, outputTokens: 0, model: FIXTURE_EXTRACTION_MODEL });
		expect(invoice.supplier_name).toBe('Distribuciones Alimentarias S.L.');
		expect(invoice.line_items).toHaveLength(2);
		expect(invoice.line_items[0]?.description).toBe('Aceite de oliva virgen extra 5L');
	});

	it('is ignored in production: the real provider is created and called', async () => {
		const generate = vi.fn(async () => ({
			text: JSON.stringify({
				supplier_name: 'Real LLM', invoice_number: 'R-1', invoice_date: null, due_date: null,
				total_amount: 10, currency: 'EUR', tax_base: null, tax_breakdown: null, confidence: 0.9, line_items: [],
			}),
			usage: { inputTokens: 5, outputTokens: 7, model: 'gemini-test' },
		}));
		vi.doMock('../src/lib/server/llm-provider', async (importOriginal) => ({
			...(await importOriginal<object>()),
			createGeminiProvider: () => ({ generate, model: 'gemini-test' }),
		}));
		const { extractWithProvider } = await loadExtract('production');
		const file = scratchFile(`${CASE_ID}_ab12cd.png`, 'png-bytes');
		const { invoice, usage } = await extractWithProvider(file);
		expect(generate).toHaveBeenCalledOnce();
		expect(invoice.supplier_name).toBe('Real LLM');
		expect(usage.model).toBe('gemini-test');
	});
});
