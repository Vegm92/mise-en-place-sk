/**
 * Destructive-DDL detection for the `migration-expand-contract` gate
 * (issue #1009), kept in its own module so the rule is testable as a pure
 * function rather than only through a spawned lint run.
 *
 * Both services migrate as a Railway *pre-deploy* step (`railway.json:11-13`,
 * `railway.worker.json:12-14`), so the schema changes while the **old** web
 * container is still serving requests against it. A migration that drops or
 * retypes a live column therefore breaks the running code for the length of
 * the deploy — which is why the contract half has to ship in a *later* deploy
 * than the code that stopped reading the column.
 *
 * Nine committed migrations are destructive (`0017`, `0026`, `0032`, `0036`,
 * `0038`, `0039`, `0047`, `0050`, `0074`) and every one of them was safe only
 * because whoever wrote it remembered the ordering. This module is what lets
 * CI say so out loud.
 */

/**
 * The three shapes that break a running reader. `DROP MATERIALIZED VIEW` is
 * deliberately absent: migration 0039 drops four and rebuilds them in the same
 * transaction, and the rollups are read by a nightly job rather than by a
 * request path, so it is not the failure this gate is looking for.
 */
const DESTRUCTIVE_PATTERNS = [
	{ kind: 'DROP COLUMN', pattern: /\bDROP\s+COLUMN\b/i },
	{ kind: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/i },
	{ kind: 'ALTER COLUMN … TYPE', pattern: /\bALTER\s+(?:COLUMN\s+)?"?\w+"?\s+(?:SET\s+DATA\s+)?TYPE\b/i },
];

/** The escape hatch, written in the migration's own header comment. */
export const EXPAND_CONTRACT_DIRECTIVE = 'expand-contract-ok';

const WAIVER_PATTERN = new RegExp(`--[^\\S\\n]*${EXPAND_CONTRACT_DIRECTIVE}:[^\\S\\n]*\\S`, 'i');

/**
 * Blanks out SQL line and block comments so a header that *describes* a
 * `DROP COLUMN` — migration 0050's does, at length — is not itself read as
 * one. Blanked rather than removed so line numbers still line up.
 *
 * @param {string} sql
 * @returns {string}
 */
function stripComments(sql) {
	return sql
		.replace(/\/\*[\s\S]*?\*\//g, (/** @type {string} */ m) => m.replace(/[^\n]/g, ' '))
		.replace(/--[^\n]*/g, (/** @type {string} */ m) => ' '.repeat(m.length));
}

/**
 * True when the migration carries `-- expand-contract-ok: <reason>`, the
 * annotation that says the readers were repointed in an earlier deploy. A
 * bare directive with no reason after it does not count.
 *
 * @param {string} sql
 * @returns {boolean}
 */
export function hasExpandContractWaiver(sql) {
	return WAIVER_PATTERN.test(sql);
}

/**
 * Every destructive statement in `sql`, as `{ line, kind, text }` with `line`
 * 1-based in the original file. Comments are blanked rather than removed so
 * the line numbers still point at the real statement.
 *
 * @param {string} sql
 * @returns {Array<{ line: number, kind: string, text: string }>}
 */
export function destructiveStatements(sql) {
	const lines = stripComments(sql).split('\n');
	/** @type {Array<{ line: number, kind: string, text: string }>} */
	const found = [];
	lines.forEach((line, i) => {
		for (const { kind, pattern } of DESTRUCTIVE_PATTERNS) {
			if (pattern.test(line)) found.push({ line: i + 1, kind, text: line.trim() });
		}
	});
	return found;
}
