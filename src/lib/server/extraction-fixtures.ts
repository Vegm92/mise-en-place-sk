import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { LLMUsage } from './llm-provider';

export const FIXTURE_EXTRACTION_MODEL = 'fixture';

export const FIXTURE_USAGE: LLMUsage = { inputTokens: 0, outputTokens: 0, model: FIXTURE_EXTRACTION_MODEL };

const DEFAULT_GOLDEN_DIR = path.resolve('tests/golden');

interface GoldenCase {
	id: string;
	input: string;
}

function sha256(buf: Buffer): string {
	return createHash('sha256').update(buf).digest('hex');
}

function readJson(filePath: string): unknown {
	return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function caseInputHash(goldenDir: string, c: GoldenCase): string | null {
	try {
		return sha256(readFileSync(path.join(goldenDir, 'cases', c.id, c.input)));
	} catch {
		return null;
	}
}

export function fixtureInvoiceJson(filePath: string, goldenDir: string = DEFAULT_GOLDEN_DIR): string {
	const cases = readJson(path.join(goldenDir, 'index.json')) as GoldenCase[];
	const fallback = Array.isArray(cases) ? cases[0] : undefined;
	if (!fallback) throw new Error(`EXTRACTION_FIXTURES: no golden cases in ${goldenDir}`);
	const fileHash = sha256(readFileSync(filePath));
	const stem = path.basename(filePath, path.extname(filePath)).toLowerCase();

	const byHash = cases.find((c) => caseInputHash(goldenDir, c) === fileHash);
	const byName = byHash ? undefined : cases.find((c) => stem.includes(c.id.toLowerCase()));
	const matched = byHash ?? byName;
	const source = matched ?? fallback;

	const expected = readJson(path.join(goldenDir, 'cases', source.id, 'expected.json')) as Record<string, unknown>;
	const lineItems = Array.isArray(expected.line_items) ? expected.line_items as Record<string, unknown>[] : [];
	const invoiceNumber = typeof expected.invoice_number === 'string' ? expected.invoice_number : 'FIXTURE';

	return JSON.stringify({
		...expected,
		invoice_number: matched ? invoiceNumber : `${invoiceNumber}-${fileHash.slice(0, 6)}`,
		line_items: lineItems.map((item) => ({ ...item, confidence: 0.95 })),
		field_confidences: expected.field_confidences ?? {},
		confidence: typeof expected.confidence === 'number' ? expected.confidence : 0.95,
	});
}
