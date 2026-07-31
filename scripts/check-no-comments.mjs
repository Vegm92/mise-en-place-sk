#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const STAGED = process.argv.includes('--staged');
const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const ALLOWED = [
	/^\s*\/?\s*@ts-/,
	/^\s*eslint/,
	/^\s*prettier-ignore/,
	/^\s*svelte-ignore/,
	/@vite-ignore/,
	/webpackIgnore|webpackChunkName/,
	/^\s*(istanbul|c8|v8) ignore/,
	/^\s*@vitest-/,
	/^\s*biome-ignore/,
	/^\s*<reference/,
	/^\s*@(license|preserve)/
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

function svelteBlocks(text, tag) {
	const blocks = [];
	const re = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
	let m;
	while ((m = re.exec(text))) {
		const s = m.index + m[0].length;
		const e = text.toLowerCase().indexOf(`</${tag}>`, s);
		if (e === -1) continue;
		blocks.push([s, e]);
		re.lastIndex = e;
	}
	return blocks;
}

function findComments(file, text) {
	const ranges = [];
	if (file.endsWith('.ts')) {
		ranges.push(...scriptRanges(text));
	} else {
		const scripts = svelteBlocks(text, 'script');
		const styles = svelteBlocks(text, 'style');
		for (const [s, e] of scripts) {
			for (const [a, b] of scriptRanges(text.slice(s, e))) ranges.push([a + s, b + s]);
		}
		const covered = [...scripts, ...styles].sort((a, b) => a[0] - b[0]);
		const regions = [];
		let cursor = 0;
		for (const [s, e] of covered) {
			if (s > cursor) regions.push([cursor, s]);
			cursor = Math.max(cursor, e);
		}
		if (cursor < text.length) regions.push([cursor, text.length]);
		for (const [rs, re_] of regions) {
			let i = rs;
			while (i < re_) {
				const open = text.indexOf('<!--', i);
				if (open === -1 || open >= re_) break;
				let close = text.indexOf('-->', open + 4);
				if (close === -1 || close + 3 > re_) close = re_ - 3;
				ranges.push([open, close + 3]);
				i = close + 3;
			}
		}
	}

	const lineStarts = [0];
	for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
	const lineOf = (pos) => {
		let lo = 0;
		let hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lineStarts[mid] <= pos) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};

	return ranges
		.sort((a, b) => a[0] - b[0])
		.map(([s, e]) => ({ line: lineOf(s), raw: text.slice(s, e) }))
		.filter((c) => !isAllowed(c.raw));
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
			console.error('Explanatory comments are not allowed in src/ — document them in docs/CODE_NOTES.md instead.\n');
		}
		const first = c.raw.split('\n')[0].trim();
		console.error(`  ${rel}:${c.line}  ${first.length > 100 ? first.slice(0, 97) + '…' : first}`);
		total++;
	}
}

if (total > 0) {
	console.error(`\n${total} comment${total === 1 ? '' : 's'} found.`);
	console.error('Allowed: @ts-*, eslint-*, svelte-ignore, prettier-ignore, @vite-ignore, c8/v8/istanbul ignore, @vitest-*, /// <reference>.');
	console.error('Bypass once with: git commit --no-verify');
	process.exit(1);
}

console.log(`check-no-comments: clean (${STAGED ? 'staged' : 'all src'})`);
