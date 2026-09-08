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
 * fine", not a guarantee; treat a fail here as "go look".
 *
 * Calibration. This script used to scan src/ AND tests/ at --min-lines 5
 * --min-tokens 30, and reported 9.9% on a PR that SonarCloud passed at 0.6%
 * — a disagreement large enough to fail CI on a branch the real gate was
 * happy with. Two independent causes, both measured before changing this:
 *
 *   - Scope. SonarCloud does not compute duplication on test files: it
 *     classifies *.test.ts as test code, and Duplication on New Code is a
 *     main-source metric. That is why .sonarcloud.properties says nothing
 *     about tests/ — it does not need to. On that PR, 109 of the 119
 *     reported duplicate lines sat in tests/, lines the gate never looks
 *     at. Scanning tests/ here was not a stricter version of the gate, it
 *     was a different measurement that CI then failed the build on.
 *
 *   - Sensitivity. SonarCloud's JS/TS detector needs ~10 lines and ~100
 *     tokens before it calls something a clone. At 5 lines / 30 tokens
 *     jscpd matches far smaller fragments — any two five-line object
 *     literals sharing a key shape — so it reports clones the gate never
 *     would. Across all of src/, Sonar's thresholds find one clone
 *     (18 lines, 0.04%); the old settings found dozens.
 *
 * Both are aligned to the gate below. If this script ever fails while
 * SonarCloud passes, re-measure both before refactoring anything.
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
import os from 'node:os';
import path from 'node:path';
import { resolveExecutable } from './resolve-executable.mjs';

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
const SCANNED_DIRS = ['src'];

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
		'--min-lines', '10',
		'--min-tokens', '100',
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
		// jscpd reports paths with the OS-native separator; git diff (and our
		// addedByFile keys) always uses "/", even on Windows — normalize so the
		// lookup below actually matches instead of silently missing every hit.
		const file = side.name.replaceAll('\\', '/');
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
