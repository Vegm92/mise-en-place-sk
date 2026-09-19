#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Approximates SonarCloud's "Duplication on New Code" gate (≤ 3%) locally,
 * so a PR doesn't need a round trip through CI/SonarCloud to find out it
 * fails it.
 *
 * This re-implements the relevant slice of SonarSource's CPD detector
 * directly (TypeScript's own scanner, the one `tsc` uses) rather than
 * shelling out to a third-party clone detector, because two things this
 * script used to assume about the real gate turned out to be wrong —
 * discovered by comparing against SonarCloud's actual readings on PR #1120
 * (issue #1121), which it disagreed with by up to 9pp:
 *
 *   - SonarCloud DOES compute duplication on test files. There is no
 *     "test code is exempt" rule for this metric — Duplication on New Code
 *     covers everything the analysis indexes, tests/*.test.ts included.
 *     This script used to scan only `src/`, on the theory that Sonar
 *     classifies test files separately and skips them here; that theory was
 *     wrong. On PR #1120, the lines SonarCloud flagged at every failing
 *     head were entirely inside `tests/config.test.ts` (added by #1049) —
 *     lines a `src/`-only scan is structurally blind to. Scanning `tests/`
 *     is required to see what the gate sees, not an optional stricter mode.
 *
 *   - SonarCloud's tokenizer anonymises string and template literals before
 *     comparing token sequences: every string/template literal becomes one
 *     placeholder token, so two blocks that differ only in their string
 *     contents (two near-identical test cases, two object literals with
 *     the same shape and different values) are the same sequence to Sonar.
 *     A literal-exact detector (this script's previous jscpd-based version
 *     included) treats those as distinct and misses the clone entirely.
 *     Every string/template-literal token below is replaced with a single
 *     `LIT` placeholder using TypeScript's scanner token kinds, not string
 *     content matching, for exactly this reason.
 *
 * Re-measured against #1120's heads after fixing both: this script's
 * reading tracked SonarCloud's within about a point at every head,
 * including the head that only just passed. See the issue for the exact
 * before/after numbers this was calibrated against.
 *
 * Thresholds — 100 tokens / 10 lines, matching SonarCloud's JS/TS CPD
 * detector — were already correct and are unrelated to the two fixes above.
 *
 * It will not agree with SonarCloud's exact percentage — this scans `.ts`
 * (and `.tsx`/`.js`/`.mjs`) files only and does not cover `.svelte`. Treat
 * a pass here as "very likely fine", not a guarantee; a fail as "go look".
 *
 * What it does NOT do, contrary to a plausible first guess: it does not
 * blame a whole pre-existing clone on a branch that edited one line inside
 * it. The intersection below counts only lines the branch actually added.
 *
 * Usage: node scripts/check-duplication.mjs [--base <ref>] [--threshold <pct>]
 * Defaults: --base origin/main --threshold 3
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { resolveExecutable } from './resolve-executable.mjs';

const GIT = resolveExecutable('git');
const ROOT = execFileSync(GIT, ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE_PATTERN = /^[A-Za-z0-9._/~^-]+$/;
const BASE = arg('base', 'origin/main');
if (!BASE_PATTERN.test(BASE)) {
	console.error(`check-duplication: --base "${BASE}" is not a plain ref (letters, digits, "._/~^-" only).`);
	process.exit(2);
}
const THRESHOLD = Number(arg('threshold', '3'));
const SCANNED_DIRS = ['src', 'tests'];
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const MIN_TOKENS = 100;
const MIN_LINES = 10;
const LITERAL_KINDS = new Set([
	ts.SyntaxKind.StringLiteral,
	ts.SyntaxKind.NoSubstitutionTemplateLiteral,
	ts.SyntaxKind.TemplateHead,
	ts.SyntaxKind.TemplateMiddle,
	ts.SyntaxKind.TemplateTail,
]);

function git(args) {
	return execFileSync(GIT, args, { cwd: ROOT, encoding: 'utf8' });
}

/** Line numbers this branch added in `file` (in the new file's numbering), relative to BASE. */
function addedLines(file) {
	let diff;
	try {
		diff = git(['diff', '-U0', `${BASE}...HEAD`, '--', file]);
	} catch {
		return new Set();
	}
	const added = new Set();
	let newLine = 0;
	for (const line of diff.split('\n')) {
		const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
		if (hunk) {
			newLine = Number(hunk[1]);
			continue;
		}
		if (line.startsWith('+++') || line.startsWith('---')) continue;
		if (line.startsWith('+')) {
			added.add(newLine);
			newLine++;
		} else if (!line.startsWith('-')) {
			newLine++;
		}
	}
	return added;
}

function changedScannedFiles() {
	let names;
	try {
		names = git(['diff', '--name-only', '--diff-filter=ACMR', `${BASE}...HEAD`]);
	} catch (err) {
		console.error(`check-duplication: could not diff against ${BASE} (${err.message.split('\n')[0]}).`);
		console.error(`Fetch it first (git fetch origin main) or pass --base <ref>.`);
		process.exit(2);
	}
	return names.split('\n')
		.map((f) => f.trim())
		.filter((f) => f && SCANNED_DIRS.some((d) => f.startsWith(`${d}/`)))
		.filter((f) => SCANNED_EXTENSIONS.has(path.extname(f)))
		.filter((f) => fs.existsSync(path.join(ROOT, f)));
}

/** Every tracked file under the scanned dirs — the corpus a clone can be found against, not just what this branch touched. */
function corpusFiles() {
	const patterns = SCANNED_DIRS.flatMap((d) => [`${d}/*`, `${d}/**/*`]);
	let names;
	try {
		names = git(['ls-files', '--', ...patterns]);
	} catch (err) {
		console.error(`check-duplication: could not list files under ${SCANNED_DIRS.join('/, ')}/ (${err.message.split('\n')[0]}).`);
		process.exit(2);
	}
	return names.split('\n')
		.map((f) => f.trim())
		.filter((f) => f && SCANNED_EXTENSIONS.has(path.extname(f)));
}

/** Tokenizes `file`, replacing every string/template literal with a single `LIT` placeholder so clones that differ only in their literals still match, as SonarCloud's CPD detector does. */
function tokenize(file) {
	let text;
	try {
		text = fs.readFileSync(path.join(ROOT, file), 'utf8');
	} catch {
		return [];
	}
	const variant = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard;
	const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, variant, text);
	const tokens = [];
	let line = 1;
	let scannedTo = 0;
	let kind;
	while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
		const start = scanner.getTokenStart();
		for (let i = scannedTo; i < start; i++) if (text.charCodeAt(i) === 10) line++;
		scannedTo = start;
		tokens.push({ value: LITERAL_KINDS.has(kind) ? 'LIT' : scanner.getTokenText(), line });
	}
	return tokens;
}

const changed = changedScannedFiles();
if (changed.length === 0) {
	console.log(`check-duplication: no changed files under ${SCANNED_DIRS.join('/, ')}/ vs ${BASE} — nothing to check.`);
	process.exit(0);
}

const addedByFile = new Map(changed.map((f) => [f, addedLines(f)]));
const totalNewLines = [...addedByFile.values()].reduce((sum, s) => sum + s.size, 0);
if (totalNewLines === 0) {
	console.log(`check-duplication: no added lines under ${SCANNED_DIRS.join('/, ')}/ vs ${BASE} — nothing to check.`);
	process.exit(0);
}

const tokensByFile = new Map(corpusFiles().map((f) => [f, tokenize(f)]));

/** key(anonymised token window) -> every {file, startLine, endLine} it occurs at. */
const occurrencesByWindow = new Map();
for (const [file, tokens] of tokensByFile) {
	for (let i = 0; i + MIN_TOKENS <= tokens.length; i++) {
		const key = tokens.slice(i, i + MIN_TOKENS).map((t) => t.value).join('\u0001');
		let occurrences = occurrencesByWindow.get(key);
		if (!occurrences) {
			occurrences = [];
			occurrencesByWindow.set(key, occurrences);
		}
		occurrences.push({ file, startLine: tokens[i].line, endLine: tokens[i + MIN_TOKENS - 1].line });
	}
}

const duplicatedByFile = new Map();
for (const occurrences of occurrencesByWindow.values()) {
	if (occurrences.length < 2) continue;
	for (const occ of occurrences) {
		if (occ.endLine - occ.startLine + 1 < MIN_LINES) continue;
		const added = addedByFile.get(occ.file);
		if (!added) continue;
		let entry;
		for (let ln = occ.startLine; ln <= occ.endLine; ln++) {
			if (!added.has(ln)) continue;
			if (!entry) {
				entry = duplicatedByFile.get(occ.file);
				if (!entry) {
					// against: otherFile -> the widest matched range against it, since
					// overlapping sliding windows would otherwise print one line per
					// window shift instead of one clone.
					entry = { lines: new Set(), against: new Map() };
					duplicatedByFile.set(occ.file, entry);
				}
			}
			entry.lines.add(ln);
		}
		if (entry) {
			for (const other of occurrences) {
				if (other === occ) continue;
				const span = entry.against.get(other.file);
				if (!span) entry.against.set(other.file, { start: other.startLine, end: other.endLine });
				else {
					span.start = Math.min(span.start, other.startLine);
					span.end = Math.max(span.end, other.endLine);
				}
			}
		}
	}
}

const totalNewDuplicatedLines = [...duplicatedByFile.values()].reduce((sum, e) => sum + e.lines.size, 0);
const pct = totalNewLines === 0 ? 0 : (totalNewDuplicatedLines / totalNewLines) * 100;

console.log(`check-duplication: ${totalNewDuplicatedLines}/${totalNewLines} new lines duplicated (${pct.toFixed(1)}%, limit ${THRESHOLD}%) vs ${BASE}`);
if (duplicatedByFile.size > 0) {
	console.log('');
	for (const [file, entry] of [...duplicatedByFile.entries()].sort((a, b) => b[1].lines.size - a[1].lines.size)) {
		console.log(`  ${file} — ${entry.lines.size} new line(s) duplicated, matching:`);
		for (const [otherFile, span] of entry.against) console.log(`    ${otherFile}:${span.start}-${span.end}`);
	}
	console.log('');
}

if (pct > THRESHOLD) {
	console.error(`check-duplication: FAILED — ${pct.toFixed(1)}% exceeds the ${THRESHOLD}% SonarCloud gate.`);
	console.error('Reduce repeated shapes above (extract a shared helper, reuse an existing fixture) before pushing.');
	process.exit(1);
}
console.log('check-duplication: OK');
