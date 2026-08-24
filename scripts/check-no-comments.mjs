#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { parse } from 'svelte/compiler';
import { PROJECT_DIRECTIVES } from './lint-directives.mjs';

const STAGED = process.argv.includes('--staged');
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const ALLOWED = [
	/^\s*(?:\/\s*)?@ts-/,
	/^\s*eslint/,
	/^\s*prettier-ignore/,
	/^\s*svelte-ignore/,
	/@vite-ignore/,
	/webpackIgnore|webpackChunkName/,
	/^\s*(istanbul|c8|v8) ignore/,
	/^\s*@vitest-/,
	/^\s*biome-ignore/,
	/^\s*<reference/,
	/^\s*@(license|preserve)/,
	...PROJECT_DIRECTIVES.map((d) => new RegExp(`^\\s*${d}:`))
];

function isAllowed(raw) {
	let body = raw;
	if (body.startsWith('///')) body = body.slice(3);
	else if (body.startsWith('//')) body = body.slice(2);
	else if (body.startsWith('/**')) body = body.slice(3);
	else if (body.startsWith('/*')) body = body.slice(2);
	else if (body.startsWith('<!--')) body = body.slice(4);
	if (body.endsWith('*/')) body = body.slice(0, -2);
	if (body.endsWith('-->')) body = body.slice(0, -3);
	return ALLOWED.some((re) => re.test(body));
}

function scriptRanges(text) {
	const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const seen = new Set();
	const out = [];
	const visit = (node) => {
		const kids = node.getChildren(sf);
		if (kids.length === 0) {
			const add = (r) => {
				const key = `${r.pos}:${r.end}`;
				if (!seen.has(key)) {
					seen.add(key);
					out.push([r.pos, r.end]);
				}
			};
			for (const r of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) add(r);
			for (const r of ts.getTrailingCommentRanges(text, node.end) ?? []) add(r);
		} else for (const k of kids) visit(k);
	};
	visit(sf);
	return out;
}

function templateCommentRanges(text) {
	const ast = parse(text, { modern: true });
	const ranges = [];
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'Comment') {
			ranges.push([node.start, node.end]);
			return;
		}
		for (const key of Object.keys(node)) {
			if (key === 'parent') continue;
			const value = node[key];
			if (Array.isArray(value)) value.forEach((child) => visit(child));
			else if (value && typeof value === 'object' && 'type' in value) visit(value);
		}
	};
	visit(ast.fragment);
	return ranges;
}

function scriptBlockRanges(text) {
	const ranges = [];
	const re = /<script(\s[^>]*)?>/gi;
	let m;
	while ((m = re.exec(text))) {
		const s = m.index + m[0].length;
		const e = text.toLowerCase().indexOf('</script>', s);
		if (e === -1) continue;
		for (const [a, b] of scriptRanges(text.slice(s, e))) ranges.push([a + s, b + s]);
	}
	return ranges;
}

function makeLineOf(text) {
	const lineStarts = [0];
	for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
	return (pos) => {
		let lo = 0;
		let hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lineStarts[mid] <= pos) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};
}

function findComments(file, text) {
	const ranges = file.endsWith('.ts')
		? scriptRanges(text)
		: [...templateCommentRanges(text), ...scriptBlockRanges(text)];
	const lineOf = makeLineOf(text);

	// A `//` directive runs until the first non-comment line. The scanner sees each
	// of those lines as its own comment, so an allowed opener vouches for the
	// continuation lines directly beneath it — otherwise a directive that needs a
	// sentence of justification is flagged for every line after the first.
	const out = [];
	let inAllowedBlock = false;
	let prevEnd = -2;
	for (const [s, e] of ranges.sort((a, b) => a[0] - b[0])) {
		const raw = text.slice(s, e);
		const line = lineOf(s);
		const continuation = raw.startsWith('//') && inAllowedBlock && line === prevEnd + 1;
		if (!continuation) inAllowedBlock = isAllowed(raw);
		if (!inAllowedBlock) out.push({ line, raw });
		prevEnd = lineOf(e - 1);
	}
	return out;
}

function targets() {
	if (STAGED) {
		const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
			encoding: 'utf8'
		});
		return out.split('\n').filter((f) => /^src\/.*\.(ts|svelte)$/.test(f));
	}
	const acc = [];
	const walk = (dir) => {
		for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, ent.name);
			if (ent.isDirectory()) walk(full);
			else if (/\.(ts|svelte)$/.test(ent.name)) {
				acc.push(path.relative(ROOT, full).replace(/\\/g, '/'));
			}
		}
	};
	walk(path.join(ROOT, 'src'));
	return acc;
}

const read = (rel) =>
	STAGED
		? execFileSync('git', ['show', `:${rel}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
		: fs.readFileSync(path.join(ROOT, rel), 'utf8');

let total = 0;
for (const rel of targets()) {
	let found;
	try {
		found = findComments(rel, read(rel));
	} catch {
		continue;
	}
	for (const c of found) {
		if (total === 0) {
			console.error('Explanatory comments are not allowed in src/ — document them in the per-subsystem Code notes sections instead.\n');
		}
		const first = c.raw.split('\n')[0].trim();
		console.error(`  ${rel}:${c.line}  ${first.length > 100 ? first.slice(0, 97) + '…' : first}`);
		total++;
	}
}

if (total > 0) {
	console.error(`\n${total} comment${total === 1 ? '' : 's'} found.`);
	const directiveList = PROJECT_DIRECTIVES.map((d) => `${d}:`).join(', ');
	console.error(`Allowed: @ts-*, eslint-*, svelte-ignore, prettier-ignore, @vite-ignore, c8/v8/istanbul ignore, @vitest-*, /// <reference>, ${directiveList}.`);
	console.error('Bypass once with: git commit --no-verify');
	process.exit(1);
}

console.log(`check-no-comments: clean (${STAGED ? 'staged' : 'all src'})`);
