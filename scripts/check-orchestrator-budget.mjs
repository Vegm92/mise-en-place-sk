#!/usr/bin/env node
/* eslint-disable no-console */

// Enforces docs/07_ai/dispatch_context_budget.md against whatever the
// coordinator has committed to docs/05_operations/dispatch/: at most N active
// worker dispatches, each with a bounded prompt size and a bounded route
// list. This cannot see a running session — GitHub Actions has no hook into
// Anthropic's session runtime — it can only check the manifest files the
// coordinator commits, the same way ORCHESTRATOR_BACKLOG.md already is the
// committed record of backlog state rather than a live view of it.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const hit = args.find((a) => a.startsWith(`--${name}=`));
	return hit ? Number(hit.split('=')[1]) : fallback;
};

const MAX_AGENTS = flag('max-agents', 2);
const MAX_PROMPT_CHARS = flag('max-prompt-chars', 6000);
const MAX_ROUTES = flag('max-routes', 8);
const MAX_AGE_HOURS = flag('max-age-hours', 3);

const DISPATCH_DIR = path.join(process.cwd(), 'docs/05_operations/dispatch');

let entries;
try {
	entries = readdirSync(DISPATCH_DIR).filter((f) => f.endsWith('.json'));
} catch {
	console.log('orchestrator-budget: no dispatch directory, nothing to check.');
	process.exit(0);
}

if (entries.length === 0) {
	console.log('orchestrator-budget: no active dispatches.');
	process.exit(0);
}

console.log(`orchestrator-budget: ${entries.length} active dispatch manifest(s).`);

const problems = [];

for (const file of entries) {
	const full = path.join(DISPATCH_DIR, file);
	const label = `docs/05_operations/dispatch/${file}`;
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(full, 'utf8'));
	} catch (err) {
		problems.push(`${label}: not valid JSON (${err.message})`);
		continue;
	}

	const { issue, title, branch, routes, dispatched_at: dispatchedAt, prompt_chars: promptChars } = parsed;

	if (!Number.isInteger(issue)) problems.push(`${label}: "issue" must be an integer.`);
	if (typeof title !== 'string' || title.trim().length === 0) {
		problems.push(`${label}: "title" must be a non-empty string.`);
	}
	if (typeof branch !== 'string' || branch.trim().length === 0) {
		problems.push(`${label}: "branch" must be a non-empty string.`);
	}

	if (!Array.isArray(routes) || routes.length === 0) {
		problems.push(`${label}: "routes" must be a non-empty array of file paths.`);
	} else {
		if (routes.length > MAX_ROUTES) {
			problems.push(
				`${label}: ${routes.length} routes exceeds the ${MAX_ROUTES}-route cap — split the dispatch, do not widen it.`
			);
		}
		for (const route of routes) {
			if (typeof route !== 'string' || route.startsWith('/') || route.includes('..')) {
				problems.push(`${label}: route "${route}" must be a repo-relative path.`);
			}
		}
	}

	if (typeof promptChars !== 'number' || promptChars <= 0) {
		problems.push(`${label}: "prompt_chars" must be a positive number.`);
	} else if (promptChars > MAX_PROMPT_CHARS) {
		problems.push(
			`${label}: prompt is ${promptChars} chars, exceeds the ${MAX_PROMPT_CHARS}-char cap — it is carrying more than the issue + routes.`
		);
	}

	const parsedDate = dispatchedAt ? new Date(dispatchedAt) : null;
	if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
		problems.push(`${label}: "dispatched_at" must be an ISO timestamp.`);
	} else {
		const ageHours = (Date.now() - parsedDate.getTime()) / 3_600_000;
		if (ageHours < 0) {
			problems.push(`${label}: "dispatched_at" is in the future.`);
		} else if (ageHours > MAX_AGE_HOURS) {
			problems.push(
				`${label}: dispatched ${ageHours.toFixed(1)}h ago, past the ${MAX_AGE_HOURS}h cap — recut it (docs/07_ai/dispatch_context_budget.md) or close it out.`
			);
		}
	}
}

if (entries.length > MAX_AGENTS) {
	problems.push(
		`${entries.length} active dispatches exceeds the ${MAX_AGENTS}-agent cap: ${entries.join(', ')}.`
	);
}

if (problems.length > 0) {
	console.error('\norchestrator-budget: violations found —\n');
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error('');
	process.exit(1);
}

console.log('orchestrator-budget: within budget.');
