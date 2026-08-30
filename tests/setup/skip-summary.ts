/**
 * The end-of-run skip summary (issue #520).
 *
 * `tests/setup/global-setup.ts` already prints a banner *before* the run, but
 * by the time 120 files have scrolled past it is 40 screens up. A green
 * "Test Files 93 passed" line at the bottom is then the last thing a developer
 * reads, and it never mentions that tenant isolation, db-crud, consent and
 * backfill did not run at all.
 *
 * This module is the pure half — it decides what the summary says given the
 * run's outcome — so `tests/skip-summary.test.ts` can assert on the text
 * without booting a second Vitest. The reporter that feeds it live data is
 * `tests/setup/skip-summary-reporter.ts`.
 */
import path from 'node:path';
import type { DbGate } from '../helpers/db-gate';

export type SkippedModule = {
	/** Absolute module id, as Vitest reports it. */
	moduleId: string;
	/** Tests skipped in the file. */
	skipped: number;
	/** Tests collected in the file, skipped ones included. */
	total: number;
};

/** Files that carry the isolation and persistence guarantees, called out by name. */
const HEADLINE_SUITES: Array<{ file: string; guarantee: string }> = [
	{ file: 'tenant-isolation.test.ts', guarantee: 'tenant isolation' },
	{ file: 'tenant-isolation-routes.test.ts', guarantee: 'tenant isolation' },
	{ file: 'db-crud.test.ts', guarantee: 'database CRUD' },
	{ file: 'invoice-save-products.test.ts', guarantee: 'invoice persistence' },
	{ file: 'consent.test.ts', guarantee: 'consent records' },
];

const RULE = '━'.repeat(66);

function relative(moduleId: string, cwd: string): string {
	const rel = path.relative(cwd, moduleId).replace(/\\/g, '/');
	return rel.startsWith('..') ? moduleId : rel;
}

/**
 * The guarantees a run left unverified, in declaration order and de-duplicated,
 * derived from which of the headline suites were skipped.
 */
export function unverifiedGuarantees(skipped: SkippedModule[], cwd: string): string[] {
	const names = new Set(skipped.map((m) => path.basename(relative(m.moduleId, cwd))));
	const out: string[] = [];
	for (const { file, guarantee } of HEADLINE_SUITES) {
		if (names.has(file) && !out.includes(guarantee)) out.push(guarantee);
	}
	return out;
}

/**
 * The summary text, or null when every file ran and there is nothing to warn
 * about. `gate` explains *why* when the database gate is what disabled them;
 * files skipped for any other reason are still listed, just without a remedy.
 */
export function skipSummary(input: {
	skipped: SkippedModule[];
	totalModules: number;
	gate: DbGate;
	cwd: string;
}): string | null {
	const { skipped, totalModules, gate, cwd } = input;
	if (skipped.length === 0) return null;

	const files = skipped
		.map((m) => ({ ...m, rel: relative(m.moduleId, cwd) }))
		.sort((a, b) => a.rel.localeCompare(b.rel));

	const skippedTests = files.reduce((n, f) => n + f.skipped, 0);
	const guarantees = unverifiedGuarantees(skipped, cwd);

	const headline =
		`⚠ ${files.length} of ${totalModules} test files skipped ` +
		`(${skippedTests} tests)` +
		(guarantees.length ? ` — ${guarantees.join(', ')} NOT verified` : '');

	const lines = ['', RULE, `  ${headline}`, ''];

	if (!gate.enabled) {
		lines.push(
			`  Reason: ${gate.skipReason}.`,
			'  Set DATABASE_TEST_URL *and* DATABASE_URL to a local Postgres to run',
			'  them — see .claude/skills/verify/SKILL.md. CI sets REQUIRE_DB_TESTS=1,',
			'  where this same gate is a hard failure rather than a skip.',
			''
		);
	} else {
		lines.push('  The database gate is enabled, so these skipped for another reason.', '');
	}

	for (const f of files) lines.push(`    ↓ ${f.rel} (${f.skipped}/${f.total} tests)`);

	lines.push('', '  A green summary above does not mean these ran.', RULE, '');
	return lines.join('\n');
}
