/**
 * The `migration-expand-contract` gate (issue #1009). Both services migrate as
 * a Railway pre-deploy step, so a `DROP COLUMN` landing in the same deploy as
 * the code that stopped reading it runs against the *old* container while it
 * is still serving. Until this gate, the only thing standing between that and
 * production was whoever wrote the migration remembering.
 *
 * These pin the detection rule itself — what counts as destructive, what a
 * comment is allowed to say, and what the waiver has to look like. The gate's
 * git plumbing (which files changed against which base) is left to CI; the
 * part worth pinning is the part that decides.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	EXPAND_CONTRACT_DIRECTIVE,
	destructiveStatements,
	hasExpandContractWaiver,
} from '../scripts/migration-sql.mjs';

describe('destructiveStatements', () => {
	it('flags the three shapes that break a running reader', () => {
		const found = destructiveStatements(
			[
				'ALTER TABLE "invoices" DROP COLUMN "legacy_total";',
				'DROP TABLE IF EXISTS "upload_sessions";',
				'ALTER TABLE "invoices" ALTER COLUMN "invoice_date" SET DATA TYPE date;',
			].join('\n'),
		);
		expect(found.map((f) => f.kind)).toEqual(['DROP COLUMN', 'DROP TABLE', 'ALTER COLUMN … TYPE']);
		expect(found.map((f) => f.line)).toEqual([1, 2, 3]);
	});

	it('accepts the additive half of an expand/contract pair', () => {
		const sql = [
			'ALTER TABLE "invoices" ADD COLUMN "invoice_date_typed" date;',
			'CREATE INDEX "invoices_supplier_idx" ON "invoices" ("supplier_id");',
		].join('\n');
		expect(destructiveStatements(sql)).toEqual([]);
	});

	it('does not read a header that describes a drop as a drop', () => {
		const sql = [
			'-- Migration 0099: the DROP COLUMN half of #1009 ships in the next deploy.',
			'/* An earlier pass would DROP TABLE "upload_sessions" here. */',
			'ALTER TABLE "invoices" ADD COLUMN "note" text;',
		].join('\n');
		expect(destructiveStatements(sql)).toEqual([]);
	});

	it('keeps line numbers pointing at the statement, not at the stripped text', () => {
		const sql = ['-- a comment', '', '/* another', '   one */', 'DROP TABLE "x";'].join('\n');
		expect(destructiveStatements(sql)).toEqual([
			{ line: 5, kind: 'DROP TABLE', text: 'DROP TABLE "x";' },
		]);
	});

	it('catches the real migration 0050, which drops a table and retypes two live columns', () => {
		const sql = readFileSync('drizzle/0050_drop_upload_sessions_bool_columns.sql', 'utf8');
		const kinds = destructiveStatements(sql).map((f) => f.kind);
		expect(kinds).toContain('DROP TABLE');
		expect(kinds.filter((k) => k === 'ALTER COLUMN … TYPE')).toHaveLength(2);
	});
});

describe('hasExpandContractWaiver', () => {
	it('accepts a directive that carries a reason', () => {
		expect(
			hasExpandContractWaiver(`-- ${EXPAND_CONTRACT_DIRECTIVE}: readers repointed in #425\nDROP TABLE "x";`),
		).toBe(true);
	});

	it('rejects a bare directive with nothing after the colon', () => {
		expect(hasExpandContractWaiver(`-- ${EXPAND_CONTRACT_DIRECTIVE}:\nDROP TABLE "x";`)).toBe(false);
		expect(hasExpandContractWaiver(`-- ${EXPAND_CONTRACT_DIRECTIVE}:   \nDROP TABLE "x";`)).toBe(false);
	});

	it('is absent from every committed migration, so the gate starts from a clean slate', () => {
		expect(hasExpandContractWaiver(readFileSync('drizzle/0050_drop_upload_sessions_bool_columns.sql', 'utf8'))).toBe(false);
	});
});
