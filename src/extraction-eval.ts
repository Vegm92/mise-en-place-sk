import './lib/server/env-file.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractWithProvider } from './lib/server/extract.js';
import { GEMINI_API_KEY } from './lib/server/env.js';
import {
	diffExtractions, summarizeComparisons, type FieldDiff, type FieldAgreement,
} from './lib/server/extraction-corpus.js';
import { getPipelineVersion } from './lib/server/pipeline-version.js';
import { flag, hasFlag } from './lib/server/cli-flags.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, '..', 'tests', 'golden');
const CASES_DIR = path.join(GOLDEN_DIR, 'cases');
const BASELINE_PATH = path.join(GOLDEN_DIR, 'baseline-report.json');

const CRITICAL_FIELDS = new Set(['total_amount', 'supplier_nif', 'invoice_number']);
const REGRESSION_TOLERANCE_POINTS = 1;

interface GoldenCaseEntry {
	id: string;
	input: string;
}

export interface CriticalFailure {
	id: string;
	field: string;
	expected: unknown;
	actual: unknown;
}

export interface EvalReport {
	pipelineVersion: string;
	generatedAt: string;
	documents: number;
	overallRate: number | null;
	fields: FieldAgreement[];
	criticalFailures: CriticalFailure[];
}

function loadCases(): GoldenCaseEntry[] {
	const indexPath = path.join(GOLDEN_DIR, 'index.json');
	if (!fs.existsSync(indexPath)) return [];
	return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

function loadExpected(id: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(path.join(CASES_DIR, id, 'expected.json'), 'utf-8'));
}

export function overallRate(fields: FieldAgreement[]): number | null {
	const rates = fields.map((f) => f.rate).filter((r): r is number => r !== null);
	if (!rates.length) return null;
	return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10;
}

async function evalCase(kase: GoldenCaseEntry): Promise<FieldDiff[]> {
	const expected = loadExpected(kase.id);
	const inputPath = path.join(CASES_DIR, kase.id, kase.input);
	const { invoice } = await extractWithProvider(inputPath);
	return diffExtractions(expected, invoice as unknown as Record<string, unknown>);
}

function loadBaseline(): EvalReport | null {
	if (!fs.existsSync(BASELINE_PATH)) return null;
	return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
}

export function checkRegression(report: EvalReport, baseline: EvalReport): string[] {
	const failures: string[] = [];
	if (report.criticalFailures.length) {
		failures.push(
			`${report.criticalFailures.length} critical-field mismatch(es): ` +
			report.criticalFailures.map((f) => `${f.id}/${f.field}`).join(', '),
		);
	}
	if (report.overallRate != null && baseline.overallRate != null
		&& report.overallRate < baseline.overallRate - REGRESSION_TOLERANCE_POINTS) {
		failures.push(`overall agreement dropped from ${baseline.overallRate}% to ${report.overallRate}% (tolerance ${REGRESSION_TOLERANCE_POINTS}pt)`);
	}
	for (const f of report.fields) {
		const base = baseline.fields.find((b) => b.field === f.field);
		if (base?.rate != null && f.rate != null && f.rate < base.rate - REGRESSION_TOLERANCE_POINTS) {
			failures.push(`field '${f.field}' agreement dropped from ${base.rate}% to ${f.rate}%`);
		}
	}
	return failures;
}

async function main(): Promise<void> {
	const gate = hasFlag('gate');

	if (!GEMINI_API_KEY) {
		console.error('[eval] GEMINI_API_KEY is not set — the eval harness needs a real key to score real extractions, and cannot run any cases without one.');
		process.exit(1);
	}

	const cases = loadCases();
	if (!cases.length) {
		console.info('[eval] no golden cases found in tests/golden/index.json — nothing to score, so this passes. Add cases under tests/golden/cases/ to make the gate meaningful again.');
		return;
	}

	if (hasFlag('dry-run')) {
		for (const kase of cases) console.info(`  ${kase.id} (${kase.input})`);
		console.info(`[eval] dry run — ${cases.length} case(s), no model calls were made`);
		return;
	}

	const perDocument: FieldDiff[][] = [];
	const criticalFailures: CriticalFailure[] = [];

	for (const kase of cases) {
		try {
			const diffs = await evalCase(kase);
			perDocument.push(diffs);
			for (const d of diffs) {
				if (CRITICAL_FIELDS.has(d.field) && !d.equal) {
					criticalFailures.push({ id: kase.id, field: d.field, expected: d.baseline, actual: d.candidate });
				}
			}
			const changed = diffs.filter((d) => !d.equal);
			if (!changed.length) {
				console.info(`  = ${kase.id}: match on all ${diffs.length} compared fields`);
			} else {
				console.info(`  ≠ ${kase.id}: ${changed.length} field(s) off`);
				for (const d of changed) console.info(`      ${d.field}: expected ${JSON.stringify(d.baseline)}, got ${JSON.stringify(d.candidate)}`);
			}
		} catch (err) {
			console.error(`  ! ${kase.id}: eval failed (counted as a critical failure):`, err);
			criticalFailures.push({ id: kase.id, field: '(eval error)', expected: null, actual: String(err) });
		}
	}

	const summary = summarizeComparisons(perDocument);
	const report: EvalReport = {
		pipelineVersion: getPipelineVersion(),
		generatedAt: new Date().toISOString(),
		documents: summary.documents,
		overallRate: overallRate(summary.fields),
		fields: summary.fields,
		criticalFailures,
	};

	console.info(`[eval] ${report.documents} document(s), overall field agreement ${report.overallRate ?? 'n/a'}%`);
	for (const f of report.fields) {
		console.info(`  ${f.field.padEnd(20)} ${f.matched}/${f.compared}${f.rate == null ? '' : ` (${f.rate}%)`}`);
	}

	const outPath = flag('out');
	if (outPath) {
		fs.writeFileSync(outPath, JSON.stringify(report, null, '\t') + '\n');
		console.info(`[eval] wrote report to ${outPath}`);
	}

	if (gate) {
		const baseline = loadBaseline();
		if (!baseline) {
			console.info('[eval] no tests/golden/baseline-report.json yet — nothing to regress against, so this bootstrap run passes. A maintainer should run `pnpm eval:accept-baseline` and commit the result so future PRs are actually gated.');
			return;
		}
		const failures = checkRegression(report, baseline);
		if (failures.length) {
			console.error('[eval] GATE FAILED — regression vs baseline:');
			for (const f of failures) console.error(`  - ${f}`);
			process.exit(1);
		}
		console.info(`[eval] gate passed — no regression vs baseline (pipeline ${baseline.pipelineVersion} → ${report.pipelineVersion})`);
	}
}

if (!process.env.VITEST) {
	await main();
	process.exit(0);
}
