#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Bans user-facing strings that bypass the i18n table (issues #294, #337, #338).
 *
 * Two passes over every .svelte file under src/:
 *   1. template — text nodes and user-visible attributes (placeholder, title,
 *      aria-label, alt), parsed from the Svelte AST so inline styles and
 *      expressions are not mistaken for prose.
 *   2. script — string literals assigned to label-ish properties, plus any
 *      literal carrying Spanish orthography, which is prose by definition.
 *
 * Language-neutral tokens (brand, currency codes, units, date formats) are
 * allowlisted below. Legal pages and the marketing landing keep their own
 * locale-keyed copy and are skipped wholesale.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { parse } from 'svelte/compiler';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const SKIP_FILES = [
	'src/routes/privacy/+page.svelte',
	'src/routes/terms/+page.svelte',
	'src/routes/waitlist/+page.svelte',
	// Mock product/invoice illustrations for the waitlist landing — fixture-like
	// demo data (supplier names, line items), not real UI copy. Same exemption
	// as the page they were extracted from.
	'src/lib/components/waitlist/AppDashboardMock.svelte',
	'src/lib/components/waitlist/CaptureMock.svelte',
	'src/lib/components/waitlist/DashboardMock.svelte',
	'src/lib/components/waitlist/ExtractMock.svelte'
];

const TEXT_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt']);

const ALLOWED = new Set([
	'Mise en Place',
	'· Mise en Place',
	'EUR',
	'kg',
	'CV:',
	'YYYY-MM-DD',
	'OK',
	'WARN',
	'ERR',
	'var(--mep-fg)',
	'var(--mep-fg-2)'
]);

const LABEL_PROPS = /^(label|title|text|placeholder|heading|subtitle|sub|msg|message|caption|tooltip)$/;
const SPANISH = /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/;

function walk(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.name.endsWith('.svelte')) out.push(full);
	}
	return out;
}

function lineOf(src, pos) {
	return src.slice(0, pos).split('\n').length;
}

function isProse(text) {
	const t = text.replace(/\s+/g, ' ').trim();
	if (!/[A-Za-zÀ-ÿ]{2,}/.test(t)) return false;
	return !ALLOWED.has(t);
}

const violations = [];

function checkTemplate(file, src, rel) {
	let ast;
	try {
		ast = parse(src, { modern: true, filename: file });
	} catch (err) {
		console.error(`check-i18n-strings: could not parse ${rel}: ${err.message}`);
		process.exit(1);
	}

	const isStyleOrScript = (node) =>
		node.type === 'RegularElement' && (node.name === 'style' || node.name === 'script');

	const report = (kind, text, pos) =>
		violations.push({ rel, line: lineOf(src, pos), kind, text });

	const checkAttribute = (node) => {
		if (!TEXT_ATTRS.has(node.name) || !Array.isArray(node.value)) return;
		for (const part of node.value) {
			if (part.type === 'Text' && isProse(part.data)) {
				report(node.name, part.data, part.start);
			}
		}
	};

	const checkText = (node) => {
		if (!isProse(node.data ?? '')) return;
		report('text', node.data, node.start);
	};

	const checkNode = (node, inStyle) => {
		if (node.type === 'Attribute') {
			checkAttribute(node);
			return true;
		}
		if (node.type === 'Text' && !inStyle) {
			checkText(node);
		}
		return false;
	};

	const visit = (node, inStyle) => {
		if (!node || typeof node !== 'object') return;
		if (checkNode(node, inStyle)) return;
		const nextInStyle = inStyle || isStyleOrScript(node);
		for (const key of Object.keys(node)) {
			if (key === 'parent') continue;
			const value = node[key];
			if (Array.isArray(value)) value.forEach((child) => visit(child, nextInStyle));
			else if (value && typeof value === 'object' && 'type' in value) visit(value, nextInStyle);
		}
	};

	visit(ast.fragment, false);
}

function checkScript(src, rel) {
	for (const block of src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
		const code = block[1];
		const offset = block.index + block[0].indexOf(code);
		const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

		const flag = (node, text, kind) => {
			if (!isProse(text)) return;
			violations.push({ rel, line: lineOf(src, offset + node.getStart(sf)), kind, text });
		};

		const visit = (node) => {
			if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
				const name = node.name.getText(sf).replace(/['"]/g, '');
				if (LABEL_PROPS.test(name)) flag(node.initializer, node.initializer.text, `prop:${name}`);
			}
			if (
				(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
				SPANISH.test(node.text)
			) {
				flag(node, node.text, 'literal');
			}
			if (ts.isTemplateExpression(node)) {
				for (const span of [node.head, ...node.templateSpans.map((s) => s.literal)]) {
					if (SPANISH.test(span.text)) flag(span, span.text, 'template');
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
}

for (const file of walk(path.join(ROOT, 'src')).sort()) {
	const rel = path.relative(ROOT, file).split(path.sep).join('/');
	if (SKIP_FILES.includes(rel)) continue;
	const src = fs.readFileSync(file, 'utf8');
	checkTemplate(file, src, rel);
	checkScript(src, rel);
}

const seen = new Set();
const unique = violations.filter((v) => {
	const key = `${v.rel}:${v.line}:${v.text.trim()}`;
	if (seen.has(key)) return false;
	seen.add(key);
	return true;
});

if (unique.length > 0) {
	console.error(
		'\nUser-facing strings must come from the i18n table — use $t / $ti / $tp instead of literals.\n' +
			'Add the key to BOTH locales in src/lib/i18n.ts. Language-neutral tokens can be\n' +
			'allowlisted in scripts/check-i18n-strings.mjs.\n'
	);
	for (const v of unique) {
		console.error(`  ${v.rel}:${v.line}  [${v.kind}]  ${v.text.replace(/\s+/g, ' ').trim().slice(0, 100)}`);
	}
	console.error(`\n${unique.length} violation(s).\n`);
	process.exit(1);
}

console.log('check-i18n-strings: clean');
