#!/usr/bin/env node
/* eslint-disable no-console */

// Answers the one question CI cannot: "is another open PR already editing these files?"
// Parallel sessions each pass every gate and still duplicate each other's work —
// #685 (a complete, green, 1,620-line reports feature) was thrown away because
// #687 had built the same thing on a different branch. See
// docs/07_ai/parallel_sessions.md.

import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const WARN_ONLY = args.includes('--warn-only');
const BASE = (args.find((a) => a.startsWith('--base=')) ?? '--base=main').split('=')[1];
const MAX_ADDED_LINES = Number(
	(args.find((a) => a.startsWith('--max-added=')) ?? '--max-added=800').split('=')[1]
);

// rawGit must not trim: `git status --porcelain` encodes the status in the first
// two columns, and trimming eats the leading space of the first line.
const rawGit = (...a) => {
	try {
		return execFileSync('git', a, { encoding: 'utf8' });
	} catch {
		return '';
	}
};
const tryGit = (...a) => rawGit(...a).trim();

function repoSlug() {
	const url = tryGit('remote', 'get-url', 'origin');
	const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
	if (!m) return null;
	return { owner: m[1], repo: m[2] };
}

function token() {
	const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (fromEnv) return fromEnv;
	try {
		return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return null;
	}
}

// Everything this branch touches: committed since the merge base, plus the
// working tree — the check earns its keep BEFORE the code is written.
function localChanges() {
	const files = new Set();
	let added = 0;

	const range = `origin/${BASE}...HEAD`;
	for (const line of rawGit('diff', '--numstat', range).split('\n')) {
		if (!line.trim()) continue;
		const [plus, , file] = line.split('\t');
		if (file) files.add(file.trim());
		added += Number(plus) || 0;
	}
	for (const line of rawGit('status', '--porcelain').split('\n')) {
		const file = line.slice(3).trim();
		if (file) files.add(file.includes(' -> ') ? file.split(' -> ')[1] : file);
	}
	return { files, added };
}

async function api(path, tok) {
	const res = await fetch(`https://api.github.com${path}`, {
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${tok}`,
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});
	if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
	return res.json();
}

async function openPullRequests(slug, tok) {
	const out = [];
	for (let page = 1; page <= 3; page += 1) {
		const batch = await api(
			`/repos/${slug.owner}/${slug.repo}/pulls?state=open&per_page=100&page=${page}`,
			tok
		);
		out.push(...batch);
		if (batch.length < 100) break;
	}
	return out;
}

async function filesOf(slug, number, tok) {
	const out = [];
	for (let page = 1; page <= 3; page += 1) {
		const batch = await api(
			`/repos/${slug.owner}/${slug.repo}/pulls/${number}/files?per_page=100&page=${page}`,
			tok
		);
		out.push(...batch.map((f) => f.filename));
		if (batch.length < 100) break;
	}
	return out;
}

const skip = (why) => {
	console.log(`pr-overlap: skipped — ${why}`);
	process.exit(0);
};

const slug = repoSlug();
if (!slug) skip('origin is not a GitHub remote');

const tok = token();
if (!tok) skip('no GitHub credentials (set GITHUB_TOKEN or run `gh auth login`)');

const branch = tryGit('rev-parse', '--abbrev-ref', 'HEAD');
const { files, added } = localChanges();

if (files.size === 0) skip(`no changes against origin/${BASE}`);

console.log(`pr-overlap: ${files.size} file(s) on ${branch}, ${added} line(s) added vs origin/${BASE}.`);

let prs = [];
const collisions = [];

try {
	prs = (await openPullRequests(slug, tok)).filter((pr) => pr.head?.ref !== branch);
	for (const pr of prs) {
		const shared = (await filesOf(slug, pr.number, tok)).filter((f) => files.has(f));
		if (shared.length > 0) collisions.push({ pr, shared });
	}
} catch (err) {
	// A dead token or a rate limit must not block the work; the size cap below
	// is local and still worth reporting.
	console.log(`pr-overlap: could not read open PRs — ${err.message}`);
	console.log('pr-overlap: overlap NOT checked; treat the surface as unclaimed at your own risk.');
	if (added > MAX_ADDED_LINES) {
		console.error(`\n${added} added lines exceeds the ${MAX_ADDED_LINES}-line cap for a reviewable PR.`);
		process.exit(WARN_ONLY ? 0 : 1);
	}
	process.exit(0);
}

console.log(`pr-overlap: compared against ${prs.length} other open PR(s).`);

let failed = false;

if (collisions.length > 0) {
	failed = true;
	console.error('\nAnother open PR already edits these files:\n');
	for (const { pr, shared } of collisions) {
		const draft = pr.draft ? ' [draft]' : '';
		console.error(`  #${pr.number}${draft} ${pr.title}`);
		console.error(`  ${pr.html_url}  (head: ${pr.head.ref})`);
		for (const f of shared.slice(0, 10)) console.error(`    - ${f}`);
		if (shared.length > 10) console.error(`    … and ${shared.length - 10} more`);
		console.error('');
	}
	console.error('Land or close that PR first, or move your change onto its branch.');
	console.error('Two sessions on one surface is how a finished PR gets thrown away.\n');
}

if (added > MAX_ADDED_LINES) {
	failed = true;
	console.error(
		`\n${added} added lines exceeds the ${MAX_ADDED_LINES}-line cap for a reviewable PR.`
	);
	console.error('Split it: the fix that must ship today goes on its own branch off main.');
	console.error('PR #644 — a one-function WhatsApp idempotency fix — has been unmergeable');
	console.error('since 2026-08-24 because it carries 57 files of unrelated work.\n');
}

if (!failed) console.log('pr-overlap: clear — no other open PR touches these files.');

process.exit(failed && !WARN_ONLY ? 1 : 0);
