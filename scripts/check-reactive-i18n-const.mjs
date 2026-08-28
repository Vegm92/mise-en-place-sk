#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Flags `const x = [...$t(...)]` — a translator call captured in a
 * module-scope `const` that is never re-run, so the label freezes at whatever
 * the locale was on first render and never updates on a language switch
 * (issue #534).
 *
 * Only the top-level statements of a component's `<script>` block are
 * considered "module scope" here: a `const` declared inside a function body,
 * an `$effect`/`$derived.by` callback, or any other nested block runs again
 * every time that function runs, so a `$t(...)` inside it is fine and is not
 * flagged. A `const` wrapped in `$derived(...)`, `$derived.by(...)` or a
 * generic `$derived<T>(...)` re-evaluates on every dependency change
 * (including a locale change) by rune semantics, so it is fine too.
 *
 * This is a pragmatic, TypeScript-AST-based check, not a full reactivity
 * analysis. Known limitations, kept deliberately narrow to avoid false
 * positives:
 *   - Only `const` is checked. A `let` or `$state([...$t(...)])` with the
 *     same shape would have the same latent bug but is out of scope here.
 *   - Only calls to `$t` / `$ti` / `$tp` / `$tiv` / `$tcat` are looked for
 *     (the app's translator stores) — see src/lib/i18n.ts.
 *   - A `const` whose initializer is itself a plain function/arrow function
 *     is not flagged even without `$derived`, since the body only runs when
 *     the function is called, not at declaration time (e.g. a helper that
 *     calls `$t(...)` when invoked from markup or an event handler).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TRANSLATOR_FNS = new Set(['t', 'ti', 'tp', 'tiv', 'tcat']);

/** @param {ts.Node} node */
function unwrap(node) {
	let inner = node;
	while (ts.isAsExpression(inner) || ts.isSatisfiesExpression(inner) || ts.isParenthesizedExpression(inner)) {
		inner = inner.expression;
	}
	return inner;
}

/** @param {ts.Node} node */
function isDerivedCall(node) {
	const inner = unwrap(node);
	if (!ts.isCallExpression(inner)) return false;
	const callee = inner.expression;
	if (ts.isIdentifier(callee)) return callee.text === '$derived';
	if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
		return callee.expression.text === '$derived' && callee.name.text === 'by';
	}
	return false;
}

/** @param {ts.Node} node */
function isPlainFunction(node) {
	const inner = unwrap(node);
	return ts.isArrowFunction(inner) || ts.isFunctionExpression(inner);
}

/**
 * @param {ts.Node} node
 * @param {ts.SourceFile} sf
 * @returns {boolean} whether a translator call appears anywhere in `node`
 */
function callsTranslator(node, sf) {
	let found = false;
	/** @param {ts.Node} n */
	const visit = (n) => {
		if (found) return;
		if (
			ts.isCallExpression(n) &&
			ts.isIdentifier(n.expression) &&
			n.expression.text.startsWith('$') &&
			TRANSLATOR_FNS.has(n.expression.text.slice(1))
		) {
			found = true;
			return;
		}
		ts.forEachChild(n, visit);
	};
	visit(node);
	return found;
}

/**
 * @param {ts.VariableDeclaration} decl
 * @param {ts.SourceFile} sf
 * @returns {boolean}
 */
function isOffendingConst(decl, sf) {
	if (!decl.initializer) return false;
	if (isDerivedCall(decl.initializer)) return false;
	if (isPlainFunction(decl.initializer)) return false;
	return callsTranslator(decl.initializer, sf);
}

/**
 * Every offending top-level `const` in one `<script>` block's source.
 *
 * @param {string} code the text between `<script...>` and `</script>`
 * @returns {{ name: string, pos: number }[]}
 */
export function nonReactiveTranslatorConsts(code) {
	const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	/** @type {{ name: string, pos: number }[]} */
	const out = [];
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		if ((stmt.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
		for (const decl of stmt.declarationList.declarations) {
			if (isOffendingConst(decl, sf)) {
				out.push({ name: decl.name.getText(sf), pos: decl.getStart(sf) });
			}
		}
	}
	return out;
}

/** @param {string} text @returns {{ code: string, offset: number }[]} */
function scriptBlocks(text) {
	const blocks = [];
	const re = /<script(\s[^>]*)?>/gi;
	let m;
	while ((m = re.exec(text))) {
		const s = m.index + m[0].length;
		const e = text.toLowerCase().indexOf('</script>', s);
		if (e === -1) continue;
		blocks.push({ code: text.slice(s, e), offset: s });
	}
	return blocks;
}

/** @param {string} text @param {number} pos @returns {number} */
function lineOf(text, pos) {
	return text.slice(0, pos).split('\n').length;
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
	/** @type {string[]} */
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.name.endsWith('.svelte')) out.push(full);
	}
	return out;
}

/**
 * Scans every `.svelte` file under the given directories for a non-reactive
 * `const` capturing a translator call.
 *
 * @param {string[]} dirs absolute paths
 * @returns {{ file: string, line: number, name: string }[]}
 */
export function scanDirs(dirs) {
	const violations = [];
	for (const dir of dirs) {
		if (!fs.existsSync(dir)) continue;
		for (const file of walk(dir).sort((a, b) => a.localeCompare(b))) {
			const text = fs.readFileSync(file, 'utf8');
			for (const { code, offset } of scriptBlocks(text)) {
				for (const hit of nonReactiveTranslatorConsts(code)) {
					violations.push({
						file: path.relative(ROOT, file).split(path.sep).join('/'),
						line: lineOf(text, offset + hit.pos),
						name: hit.name
					});
				}
			}
		}
	}
	return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const violations = scanDirs([
		path.join(ROOT, 'src/routes'),
		path.join(ROOT, 'src/lib/components')
	]);
	if (violations.length > 0) {
		console.error(
			'\n$t(...) (or $ti/$tp/$tiv/$tcat) captured in a non-reactive const — it evaluates once and\n' +
				'never updates on a language switch. Wrap the array/object in $derived(...) instead (issue #534).\n'
		);
		for (const v of violations) console.error(`  ${v.file}:${v.line}  const ${v.name}`);
		console.error(`\n${violations.length} violation(s).\n`);
		process.exit(1);
	}
	console.log('check-reactive-i18n-const: clean');
}
