#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const GATES = {
	'no-sql-raw': {
		roots: ['src'],
		extensions: ['.ts', '.svelte'],
		pattern: /sql\.raw\(/,
		message: 'sql.raw() is banned — use parameterized sql`...` templates instead'
	},
	'tenant-scope': {
		roots: ['src/routes', 'src/lib/server'],
		extensions: ['.ts'],
		pattern: /eq\([a-zA-Z]*\.restaurantId,/,
		exclude: (filePath) => filePath.includes(`${path.sep}admin${path.sep}`) || path.basename(filePath) === 'tenant.ts',
		message: 'raw eq(*.restaurantId,...) found — use forTenant().scope() instead (ADR-001 / issue #138)'
	}
};

/**
 * Tables whose rows belong to a restaurant, derived from schema.ts rather than
 * hardcoded so a newly added tenant table is covered the moment it is declared.
 *
 * `restaurants` is excluded because it *is* the tenant. The rest of the
 * exclusions are ADR-001's non-tenant tables: `user_restaurants` is the
 * membership pivot (keyed by user, not restaurant) and `subscriptions` is
 * billing state keyed by the Stripe customer.
 */
const NON_TENANT_TABLES = new Set(['userRestaurants', 'subscriptions']);

function tenantScopedTables() {
	const found = new Map();
	const schemaDir = path.join(ROOT, 'src/lib/server/schema');
	if (!fs.existsSync(schemaDir)) return found;
	for (const file of walk(schemaDir, ['.ts'])) {
		const src = fs.readFileSync(file, 'utf8');
		const decl = /export const (\w+)\s*=\s*pgTable\(\s*['"](\w+)['"]/g;
		const starts = [];
		let m;
		while ((m = decl.exec(src))) starts.push({ ident: m[1], table: m[2], at: m.index });
		starts.forEach((s, i) => {
			const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
			if (!/\brestaurantId\s*:/.test(src.slice(s.at, end))) return;
			if (NON_TENANT_TABLES.has(s.ident)) return;
			found.set(s.ident, s.table);
		});
	}
	return found;
}

/**
 * Flags `.from(<tenantTable>)` in a statement that carries no tenant predicate.
 *
 * The tenant-scope gate above bans the *wrong* helper; this one bans a *missing*
 * one, which is the shape that actually leaks (and the shape RLS never caught,
 * since the app connects as the table owner — ADR-005). Both leaks fixed in
 * #380 looked like this.
 *
 * A statement is accepted when it goes through forTenant().scope(), or names
 * a restaurantId column directly (bulk queries like `inArray(x.restaurantId,
 * ridsTheUserOwns)` are legitimate). Anything else needs an explicit
 *
 *   // tenant-scope-ok: <why this query is safe unscoped>
 *
 * on or above the statement — deliberate cross-tenant work (background jobs,
 * lookups already keyed by a validated owner id) is real, but should be stated.
 */
/**
 * Bounds of the expression containing `index`, tracking bracket depth so the
 * object literal in `.select({ … })` does not end it early, and so a sibling
 * query inside a `Promise.all([...])` does not bleed in — the latter matters,
 * because a scoped sibling would otherwise vouch for an unscoped query.
 *
 * Boundaries are `;` and `,` at depth 0, or the opening bracket we are nested in.
 */
function statementBounds(src, index) {
	let depth = 0;
	let start = index;
	while (start > 0) {
		const ch = src[start - 1];
		if (ch === ')' || ch === ']' || ch === '}') depth++;
		else if (ch === '(' || ch === '[' || ch === '{') {
			if (depth === 0) break;
			depth--;
		} else if ((ch === ';' || ch === ',') && depth === 0) break;
		start--;
	}
	depth = 0;
	let end = index;
	while (end < src.length) {
		const ch = src[end];
		if (ch === '(' || ch === '[' || ch === '{') depth++;
		else if (ch === ')' || ch === ']' || ch === '}') {
			if (depth === 0) break;
			depth--;
		} else if ((ch === ';' || ch === ',') && depth === 0) break;
		end++;
	}
	return [start, end];
}

function runUnscopedQueryGate() {
	const tables = tenantScopedTables();
	if (tables.size === 0) {
		console.error('Error: could not derive tenant tables from schema — gate cannot run');
		return false;
	}
	const violations = [];
	for (const root of ['src/routes', 'src/lib/server']) {
		const absRoot = path.join(ROOT, root);
		if (!fs.existsSync(absRoot)) continue;
		for (const file of walk(absRoot, ['.ts'])) {
			// Admin tooling is cross-tenant by definition, same carve-out as tenant-scope.
			if (file.includes(`${path.sep}admin${path.sep}`)) continue;
			const src = fs.readFileSync(file, 'utf8');
			const re = /\.from\(\s*(\w+)/g;
			let m;
			while ((m = re.exec(src))) {
				if (!tables.has(m[1])) continue;
				const [start, end] = statementBounds(src, m.index);
				const statement = src.slice(start, end);
				// Only a restaurantId in the *filter* counts. Selecting the column
				// (`.select({ restaurantId: x.restaurantId })`) proves nothing about
				// which rows come back.
				const whereAt = statement.indexOf('.where(');
				const filter = whereAt === -1 ? '' : statement.slice(whereAt);
				if (/scope\(/.test(filter) || /\.restaurantId\b/.test(filter)) continue;
				const lineNo = src.slice(0, m.index).split('\n').length;
				// The annotation may sit inside the statement or on a line above it.
				const above = src.slice(0, start).split('\n').slice(-3).join('\n');
				if (/tenant-scope-ok:/.test(statement) || /tenant-scope-ok:/.test(above)) continue;
				violations.push(`${path.relative(ROOT, file)}:${lineNo}: .from(${m[1]}) with no tenant predicate`);
			}
		}
	}
	if (violations.length > 0) {
		console.error(
			'Error: query on a tenant-scoped table with no tenant predicate — use forTenant().scope(),\n' +
				'filter on restaurantId, or annotate with `// tenant-scope-ok: <reason>` (ADR-001 / issue #380)'
		);
		for (const v of violations) console.error(`  ${v}`);
		return false;
	}
	return true;
}

function walk(dir, extensions) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walk(full, extensions));
		} else if (extensions.includes(path.extname(entry.name))) {
			files.push(full);
		}
	}
	return files;
}

function runGate(name, gate) {
	const violations = [];
	for (const root of gate.roots) {
		const absRoot = path.join(ROOT, root);
		if (!fs.existsSync(absRoot)) continue;
		for (const file of walk(absRoot, gate.extensions)) {
			if (gate.exclude?.(file)) continue;
			const lines = fs.readFileSync(file, 'utf8').split('\n');
			lines.forEach((line, i) => {
				if (gate.pattern.test(line)) {
					violations.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
				}
			});
		}
	}
	if (violations.length > 0) {
		console.error(`Error: ${gate.message}`);
		for (const v of violations) console.error(`  ${v}`);
		return false;
	}
	return true;
}

const requested = process.argv[2];
const names = requested ? [requested] : [...Object.keys(GATES), 'unscoped-tenant-query'];

let ok = true;
for (const name of names) {
	if (name === 'unscoped-tenant-query') {
		if (!runUnscopedQueryGate()) ok = false;
		continue;
	}
	const gate = GATES[name];
	if (!gate) {
		console.error(`Unknown lint gate: ${name}`);
		process.exit(1);
	}
	if (!runGate(name, gate)) ok = false;
}

process.exit(ok ? 0 : 1);
