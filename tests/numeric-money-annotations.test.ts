/**
 * Issue #524 — a `sql<number>` (or `sql<number | null>`) tagged template that
 * touches a numeric(12,2) money column lies about its return type: postgres.js
 * parses `numeric` columns as strings, so the honest options are casting the
 * SQL expression to `::float8`/`::int`/`::integer` (the returned value really
 * is a JS number), or annotating the site as a string and converting at the
 * boundary via `$lib/server/money`. See `src/lib/server/alerts.ts`'s
 * `COALESCE(SUM(...), 0)::float8` for the established pattern.
 *
 * This scan targets exactly the sites that spell out `sql<number>` (or
 * `sql<number | null>`) — the shape every violation found under #524 took —
 * and flags one that references a money column without a numeric cast
 * anywhere in the template. It intentionally does NOT try to correlate a
 * `db.execute<{ field: number }>(sql\`...\`)` site's declared interface back
 * to the SQL column it selects: that pattern is comingled with unrelated
 * fields, aliases, and `as unknown as` casts throughout the codebase, and a
 * scanner trying to match field name to column name there would carry a high
 * false-positive rate for a low-effort static check. Sites of that shape are
 * covered by manual audit (#524) and by the DB-backed spot check below, not
 * by this scan.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.join(process.cwd(), 'src');

const MONEY_COLUMN_PATTERN =
	/totalAmount|total_amount|taxBase|tax_base|normalizedUnitPrice|normalized_unit_price|unitPrice|unit_price|totalPrice|total_price|monthlyBudget|monthly_budget|lineAmountExpr\(/;

const NUMERIC_CAST_PATTERN = /::\s*(float8|int|integer)\b/i;

const SQL_NUMBER_TEMPLATE = /sql<\s*number(?:\s*\|\s*null)?\s*>\s*`([^`]*)`/g;

function walkTsFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkTsFiles(full));
		} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
			files.push(full);
		}
	}
	return files;
}

const sourceFiles = walkTsFiles(SRC_DIR);

describe('sql<number> templates over money columns cast to a real numeric type (issue #524)', () => {
	it('scanned a non-trivial number of source files', () => {
		expect(sourceFiles.length).toBeGreaterThan(100);
	});

	for (const file of sourceFiles) {
		const relPath = path.relative(process.cwd(), file);
		const src = fs.readFileSync(file, 'utf8');
		if (!src.includes('sql<')) continue;

		let match: RegExpExecArray | null;
		SQL_NUMBER_TEMPLATE.lastIndex = 0;
		let index = 0;
		while ((match = SQL_NUMBER_TEMPLATE.exec(src)) !== null) {
			const body = match[1]!;
			if (!MONEY_COLUMN_PATTERN.test(body)) continue;
			index += 1;
			it(`${relPath} — sql<number> site #${index} touching a money column casts ::float8/::int`, () => {
				expect(body).toMatch(NUMERIC_CAST_PATTERN);
			});
		}
	}
});
