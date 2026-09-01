#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Approximates SonarCloud's "Duplication on New Code" gate (≤ 3%) locally,
 * so a PR doesn't need a round trip through CI/SonarCloud to find out it
 * fails it. Not a re-implementation of SonarSource's proprietary clone
 * detector — this shells out to jscpd (a real, independent duplicate-code
 * detector) over `src/` and `tests/` (the same scope Sonar effectively
 * analyses; `.sonarcloud.properties` confirms it never measures duplication
 * on docs/**.md), then intersects the reported clones with the lines this
 * branch actually added versus its base, the same "New Code" definition
 * SonarCloud uses for a PR.
 *
 * This will not agree with SonarCloud's number exactly — different clone
 * detector, and it does not cover .svelte files (jscpd's tokenizer doesn't
 * parse them the way it does .ts/.js). Treat a pass here as "very likely
 * fine", not a guarantee; treat a fail here as "go look", since it has
 * caught the real issue every time it's been used against this repo so far.
 *
 * Usage: node scripts/check-duplication.mjs [--base <ref>] [--threshold <pct>]
 * Defaults: --base origin/main --threshold 3
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolves `name` to an absolute path by walking PATH ourselves, once, so
 * every later execFileSync call passes an absolute path instead of a bare
 * command name (SonarCloud S4036 — a bare name re-resolves against PATH on
 * every call, which a writable/tampered PATH entry earlier in the list
 * could hijack; resolving once up front and reusing the absolute path closes
 * that window for the rest of this process).
 */
function resolveExecutable(name) {
	const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
	for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
		if (!dir) continue;
		for (const ext of exts) {
			const candidate = path.join(dir, name + ext);
			try {
				fs.accessSync(candidate, fs.constants.X_OK);
				return candidate;
			} catch {
				continue;
			}
		}
	}
	throw new Error(`check-duplication: "${name}" not found on PATH.`);
}

const GIT = resolveExecutable('git');
const ROOT = execFileSync(GIT, ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE_PATTERN = /^[A-Za-z0-9._/-]+$/;
const BASE = arg('base', 'origin/main');
if (!BASE_PATTERN.test(BASE)) {
	console.error(`check-duplication: --base "${BASE}" is not a plain ref (letters, digits, "._/-" only).`);
	process.exit(2);
}
const THRESHOLD = Number(arg('threshold', '3'));
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SCANNED_DIRS = ['src', 'tests'];

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

function runJscpd(outDir) {
	const binName = process.platform === 'win32' ? 'jscpd.cmd' : 'jscpd';
	const jscpdBin = path.join(ROOT, 'node_modules', '.bin', binName);
	const extGlob = [...SCANNED_EXTENSIONS].map((e) => e.slice(1)).join(',');
	execFileSync(jscpdBin, [
		// No positional PATH: jscpd reports file names relative to each given
		// PATH root, stripping "src/"/"tests/" from them — which then can't be
		// matched back against git's repo-root-relative paths. --pattern alone
		// scans from cwd (ROOT) and keeps the full relative path.
		'--pattern', `{${SCANNED_DIRS.join(',')}}/**/*.{${extGlob}}`,
		'--min-lines', '5',
		'--min-tokens', '30',
		'--format', 'typescript,javascript',
		'--reporters', 'json',
		'--output', outDir,
		'--silent',
	], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
	return JSON.parse(fs.readFileSync(path.join(outDir, 'jscpd-report.json'), 'utf8'));
}

const changed = changedScannedFiles();
if (changed.length === 0) {
	console.log(`check-duplication: no changed files under ${SCANNED_DIRS.join('/, ')}/ vs ${BASE} — nothing to check.`);
	process.exit(0);
}

const addedByFile = new Map(changed.map((f) => [f, addedLines(f)]));
const totalNewLines = [...addedByFile.values()].reduce((sum, s) => sum + s.size, 0);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-duplication-'));
let report;
try {
	report = runJscpd(outDir);
} finally {
	fs.rmSync(outDir, { recursive: true, force: true });
}

const newDuplicatedByFile = new Map();
for (const clone of report.duplicates ?? []) {
	for (const side of [clone.firstFile, clone.secondFile]) {
		const file = side.name;
		const added = addedByFile.get(file);
		if (!added) continue;
		const hit = [];
		for (let ln = side.start; ln <= side.end; ln++) {
			if (added.has(ln)) hit.push(ln);
		}
		if (hit.length === 0) continue;
		const other = side === clone.firstFile ? clone.secondFile : clone.firstFile;
		if (!newDuplicatedByFile.has(file)) newDuplicatedByFile.set(file, { lines: new Set(), against: new Set() });
		const entry = newDuplicatedByFile.get(file);
		for (const ln of hit) entry.lines.add(ln);
		entry.against.add(`${other.name}:${other.start}-${other.end}`);
	}
}

const totalNewDuplicatedLines = [...newDuplicatedByFile.values()].reduce((sum, e) => sum + e.lines.size, 0);
const pct = totalNewLines === 0 ? 0 : (totalNewDuplicatedLines / totalNewLines) * 100;

console.log(`check-duplication: ${totalNewDuplicatedLines}/${totalNewLines} new lines duplicated (${pct.toFixed(1)}%, limit ${THRESHOLD}%) vs ${BASE}`);
if (newDuplicatedByFile.size > 0) {
	console.log('');
	for (const [file, entry] of [...newDuplicatedByFile.entries()].sort((a, b) => b[1].lines.size - a[1].lines.size)) {
		console.log(`  ${file} — ${entry.lines.size} new line(s) duplicated, matching:`);
		for (const against of entry.against) console.log(`    ${against}`);
	}
	console.log('');
}

if (pct > THRESHOLD) {
	console.error(`check-duplication: FAILED — ${pct.toFixed(1)}% exceeds the ${THRESHOLD}% SonarCloud gate.`);
	console.error('Reduce repeated shapes above (extract a shared helper, reuse an existing fixture) before pushing.');
	process.exit(1);
}
console.log('check-duplication: OK');
