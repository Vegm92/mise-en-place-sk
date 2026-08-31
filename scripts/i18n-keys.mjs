/**
 * Reads the i18n catalog and the `$t` call sites that consume it (issue #661).
 *
 * `lint:i18n` bans prose that bypasses the catalog, but a key that is spelled
 * right and simply absent from `src/lib/messages/{es,en}.ts` compiles, ships,
 * and renders as the raw key. These helpers close that gap: the key set is
 * read back off the locale tables themselves, so it can never drift from the
 * catalog (issue #841 split the one combined table into a file per locale
 * so the client only downloads the active one), and
 * only calls whose key is a plain string literal are considered — a key built
 * from a variable, a template literal or a concatenation cannot be resolved
 * statically and is skipped rather than guessed at.
 *
 * Split out of check-i18n-strings.mjs so the detection is unit-testable.
 */
import ts from 'typescript';

/** @typedef {{ fn: string, key: string, index: number }} KeyRef */
/** @typedef {{ ref: KeyRef, locale: string, key: string }} MissingKey */

const CALL = /(?<![\w$])\$(t|ti|tiv|tp)\(\s*(['"])([^'"\n]*)\2\s*[,)]/g;

/** @param {ts.Node} node */
function unwrap(node) {
	let inner = node;
	while (
		ts.isAsExpression(inner) ||
		ts.isSatisfiesExpression(inner) ||
		ts.isParenthesizedExpression(inner)
	) {
		inner = inner.expression;
	}
	return inner;
}

/** @param {ts.PropertyName} name @param {ts.SourceFile} sf @returns {string} */
function propName(name, sf) {
	return name.getText(sf).replace(/^['"]|['"]$/g, '');
}

/**
 * The key set a single per-locale message module defines — the default
 * export object literal in `src/lib/messages/<locale>.ts`.
 *
 * @param {string} source
 * @returns {Set<string>}
 */
export function localeMessageKeys(source) {
	const sf = ts.createSourceFile('messages.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	/** @type {Set<string>} */
	const keys = new Set();

	/** @param {ts.Node} node */
	const visit = (node) => {
		if (ts.isExportAssignment(node) && !node.isExportEquals) {
			const table = unwrap(node.expression);
			if (ts.isObjectLiteralExpression(table)) {
				for (const pair of table.properties) {
					if (ts.isPropertyAssignment(pair)) keys.add(propName(pair.name, sf));
				}
			}
		}
		ts.forEachChild(node, visit);
	};

	visit(sf);
	return keys;
}

/**
 * The key set of every locale table, one source per locale — the two
 * `src/lib/messages/<locale>.ts` modules the catalog was split into
 * (issue #841). Each locale's messages live in their own file so the
 * client only downloads the active one; this reads them back individually
 * rather than off one combined `translations` object.
 *
 * @param {Record<string, string>} sourcesByLocale
 * @returns {Map<string, Set<string>>} locale -> keys it defines
 */
export function localeKeyTables(sourcesByLocale) {
	/** @type {Map<string, Set<string>>} */
	const tables = new Map();
	for (const [locale, source] of Object.entries(sourcesByLocale)) {
		tables.set(locale, localeMessageKeys(source));
	}
	return tables;
}

/**
 * Every `$t` / `$ti` / `$tiv` / `$tp` call whose key is a plain string literal.
 *
 * @param {string} source
 * @returns {KeyRef[]}
 */
export function keyReferences(source) {
	return [...source.matchAll(CALL)].map((m) => ({
		fn: m[1] ?? '',
		key: m[3] ?? '',
		index: m.index ?? 0
	}));
}

/**
 * The catalog keys a call actually looks up. `$tp` resolves a plural family,
 * so it needs both CLDR forms the app can select; `.zero` is optional.
 *
 * @param {KeyRef} ref
 * @returns {string[]}
 */
export function lookupKeys(ref) {
	return ref.fn === 'tp' ? [`${ref.key}.one`, `${ref.key}.other`] : [ref.key];
}

/**
 * @param {KeyRef[]} refs
 * @param {Map<string, Set<string>>} tables
 * @returns {MissingKey[]}
 */
export function missingKeyRefs(refs, tables) {
	/** @type {MissingKey[]} */
	const missing = [];
	for (const ref of refs) {
		for (const key of lookupKeys(ref)) {
			for (const [locale, keys] of tables) {
				if (!keys.has(key)) missing.push({ ref, locale, key });
			}
		}
	}
	return missing;
}
