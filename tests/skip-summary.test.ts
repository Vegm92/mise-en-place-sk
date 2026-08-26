/**
 * The end-of-run skip summary (issue #520).
 *
 * #106 and #336 made the *dangerous* half of silent skipping safe: CI sets
 * REQUIRE_DB_TESTS=1 so a disabled gate is a hard failure there, and the gate
 * refuses non-local databases. What was left was local developer experience —
 * `pnpm test` printing a green summary for a run that never exercised tenant
 * isolation, with the only warning 40 screens up in the scrollback.
 *
 * These cover the text; `tests/setup/skip-summary-reporter.ts` is the thin
 * Vitest adapter that feeds it, and this run is itself proof it loads.
 */
import { describe, it, expect } from 'vitest';
import { skipSummary, unverifiedGuarantees, type SkippedModule } from './setup/skip-summary';
import { resolveDbGate } from './helpers/db-gate';

const CWD = '/repo';
const LOCAL = 'postgres://postgres:postgres@localhost:5432/mise_en_place_test';

const ENABLED = resolveDbGate({ DATABASE_URL: LOCAL });
const DISABLED = resolveDbGate({});

const mod = (rel: string, skipped = 2, total = 2): SkippedModule => ({
	moduleId: `${CWD}/${rel}`,
	skipped,
	total,
});

describe('skipSummary', () => {
	it('says nothing when every file ran', () => {
		expect(skipSummary({ skipped: [], totalModules: 120, gate: ENABLED, cwd: CWD })).toBeNull();
	});

	it('leads with the file and test counts', () => {
		const summary = skipSummary({
			skipped: [mod('tests/db-crud.test.ts', 7, 7), mod('tests/consent.test.ts', 3, 3)],
			totalModules: 120,
			gate: DISABLED,
			cwd: CWD,
		});

		expect(summary).toContain('2 of 120 test files skipped');
		expect(summary).toContain('(10 tests)');
	});

	it('names the guarantee a skipped tenant-isolation suite leaves unverified', () => {
		const summary = skipSummary({
			skipped: [mod('tests/tenant-isolation.test.ts')],
			totalModules: 120,
			gate: DISABLED,
			cwd: CWD,
		});

		expect(summary).toContain('tenant isolation NOT verified');
	});

	it('states the gate reason and the remedy when the database gate disabled them', () => {
		const summary = skipSummary({
			skipped: [mod('tests/db-crud.test.ts')],
			totalModules: 120,
			gate: DISABLED,
			cwd: CWD,
		});

		expect(summary).toContain(DISABLED.skipReason);
		expect(summary).toContain('DATABASE_TEST_URL');
		expect(summary).toContain('REQUIRE_DB_TESTS=1');
	});

	it('does not blame the database gate for files skipped while it is enabled', () => {
		const summary = skipSummary({
			skipped: [mod('tests/something-else.test.ts')],
			totalModules: 120,
			gate: ENABLED,
			cwd: CWD,
		});

		expect(summary).toContain('skipped for another reason');
		expect(summary).not.toContain('DATABASE_TEST_URL');
	});

	it('lists every skipped file, relative and sorted', () => {
		const summary = skipSummary({
			skipped: [mod('tests/norm-key-parity.test.ts'), mod('tests/backfill.test.ts')],
			totalModules: 120,
			gate: DISABLED,
			cwd: CWD,
		});

		expect(summary).toContain('tests/backfill.test.ts');
		expect(summary).toContain('tests/norm-key-parity.test.ts');
		expect(summary).not.toContain(CWD);
		expect(summary!.indexOf('backfill')).toBeLessThan(summary!.indexOf('norm-key-parity'));
	});

	it('refuses to let a green run read as a full one', () => {
		const summary = skipSummary({
			skipped: [mod('tests/db-crud.test.ts')],
			totalModules: 120,
			gate: DISABLED,
			cwd: CWD,
		});

		expect(summary).toContain('does not mean these ran');
	});
});

describe('unverifiedGuarantees', () => {
	it('de-duplicates the two tenant-isolation suites into one guarantee', () => {
		const skipped = [mod('tests/tenant-isolation.test.ts'), mod('tests/tenant-isolation-routes.test.ts')];
		expect(unverifiedGuarantees(skipped, CWD)).toEqual(['tenant isolation']);
	});

	it('is empty when nothing headline was skipped', () => {
		expect(unverifiedGuarantees([mod('tests/formatters.test.ts')], CWD)).toEqual([]);
	});
});
